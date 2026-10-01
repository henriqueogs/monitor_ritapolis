const crypto = require('crypto');
const { URL } = require('url');
const axios = require('axios');
const config = require('../config');
const logger = require('../logger');
const { assertSafeUrl, createSafeHttpsAgent } = require('../http/safe-network');
const { isRetryableCollectorError, proxyCollectorRequest } = require('../http/collector-proxy');
const { createColetaLog, finishColetaLog, saveDocumento, createResumoAiJob } = require('../db');
const { extrairAno } = require('../utils/datas');

class ColetorBase {
  constructor({ fonte, httpOptions = {} }) {
    this.fonte = fonte;
    this.delayMs = config.collectorDelayMs;
    this.retryMax = config.collectorRetryMax;
    this.lastRequestAtByHost = new Map();
    this.http = axios.create({
      timeout: config.collectorTimeoutMs,
      headers: {
        'User-Agent': config.collectorUserAgent,
        Accept: '*/*',
      },
      responseType: 'text',
      httpsAgent: createSafeHttpsAgent(),
      maxContentLength: config.collectorMaxResponseBytes,
      maxBodyLength: config.collectorMaxResponseBytes,
      maxRedirects: config.collectorMaxRedirects,
      beforeRedirect: redirectOptions => {
        assertSafeUrl(
          `${redirectOptions.protocol}//${redirectOptions.hostname}${redirectOptions.path || '/'}`
        );
      },
      validateStatus: status => status >= 200 && status < 400,
      ...httpOptions,
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async respeitarDelay(url) {
    const hostname = new URL(url).hostname;
    const last = this.lastRequestAtByHost.get(hostname) || 0;
    const wait = this.delayMs - (Date.now() - last);

    if (wait > 0) {
      await this.sleep(wait);
    }

    this.lastRequestAtByHost.set(hostname, Date.now());
  }

  calcularHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async checkpoint(step, read) {
    const saved = this.progress?.load(step);
    if (saved && Object.hasOwn(saved, 'value')) {
      return saved.value;
    }
    this.progress?.checkTime();
    const value = await read();
    this.progress?.save(step, { value });
    return value;
  }

  completeItem(step, resultado) {
    this.progress?.save(step, true);
    this.progress?.save('collector-result', resultado);
  }

  async requisitarComRetry(method, url, data, options = {}) {
    assertSafeUrl(url);
    const routed = proxyCollectorRequest({ method, url, data, options });
    let lastError;

    for (let tentativa = 1; tentativa <= this.retryMax; tentativa += 1) {
      try {
        this.progress?.checkTime();
        await this.respeitarDelay(url);
        this.progress?.checkTime();
        const response = await this.http.request({
          method: routed.method,
          url: routed.url,
          data: routed.data,
          ...routed.options,
          ...(this.progress ? { timeout: Math.min(routed.options.timeout || this.http.defaults.timeout,
            this.progress.remainingMs()) } : {}),
        });
        const contentLength = Number(response.headers?.['content-length'] || 0);
        if (contentLength > config.collectorMaxResponseBytes) {
          throw new Error(`Resposta excede o limite de ${config.collectorMaxResponseBytes} bytes`);
        }
        return response;
      } catch (error) {
        if (error.code === 'PIPELINE_YIELD') {
          throw error;
        }
        lastError = error;
        logger.warn('Falha em requisicao, tentando novamente', {
          fonte: this.fonte,
          url,
          tentativa,
          erro: error.message,
        });
        if (!isRetryableCollectorError(error)) {
          throw error;
        }
        if (tentativa < this.retryMax) {
          await this.sleep(1000 * 2 ** (tentativa - 1));
        }
      }
    }

    throw lastError;
  }

  async buscarComRetry(url, options = {}) {
    return this.requisitarComRetry('get', url, undefined, options);
  }

  async postComRetry(url, data, options = {}) {
    return this.requisitarComRetry('post', url, data, options);
  }

  async baixarBuffer(url) {
    this.filePolicy?.check(url);
    try {
      const response = await this.buscarComRetry(url, { responseType: 'arraybuffer' });
      this.filePolicy?.clear(url);
      return Buffer.from(response.data);
    } catch (error) {
      this.filePolicy?.record(url, error);
      throw error;
    }
  }

  resumirTexto(text) {
    if (!text) {
      return null;
    }
    return text.replace(/\s+/g, ' ').trim().slice(0, 280) || null;
  }

  inferirAno({ numero, dataPublicacao, dataAbertura = null, titulo = null }) {
    return extrairAno({ dataPublicacao, dataAbertura, numero, titulo });
  }

  async run() {
    const inicio = new Date().toISOString();
    const logId = createColetaLog({ fonte: this.fonte, inicio });
    const resultado = {
      fonte: this.fonte,
      inicio,
      itens_novos: 0,
      itens_atualizados: 0,
      itens_sem_alteracao: 0,
      itens_com_erro: 0,
      detalhes: [],
      ...(this.progress?.load('collector-result') || {}),
    };
    if (['erro_total', 'erro_parcial'].includes(resultado.status)) {
      // Prior attempts remain in coleta_logs. Completed item counts/checkpoints
      // survive, but their obsolete errors must not poison a corrected retry.
      resultado.itens_com_erro = 0;
      resultado.detalhes = resultado.detalhes.filter(detail => !detail.erro);
    }

    try {
      await this.executar(resultado);
      resultado.status = resultado.itens_com_erro > 0 ? 'erro_parcial' : 'ok';
    } catch (error) {
      if (error.code === 'PIPELINE_YIELD') {
        resultado.status = 'continuacao';
        throw error;
      }
      resultado.status = 'erro_total';
      resultado.detalhes.push({ etapa: 'execucao', erro: error.message });
      logger.error('Coleta falhou', {
        fonte: this.fonte,
        erro: error.message,
        stack: error.stack,
      });
    } finally {
      this.progress?.save('collector-result', resultado);
      resultado.fim = new Date().toISOString();
      resultado.detalhes.push({
        etapa: 'persistencia',
        novos: resultado.itens_novos,
        alterados: resultado.itens_atualizados,
        sem_alteracao: resultado.itens_sem_alteracao || 0,
      });
      finishColetaLog(logId, resultado);
    }

    return resultado;
  }

  registrarErroItem(resultado, contexto, error) {
    if (error.code === 'PIPELINE_YIELD') {
      throw error;
    }
    resultado.itens_com_erro += 1;
    resultado.detalhes.push({
      ...contexto,
      erro: error.message,
    });
    logger.warn('Erro em item de coleta', {
      fonte: this.fonte,
      ...contexto,
      erro: error.message,
    });
  }

  salvarDocumento(documento, resultado) {
    const saved = saveDocumento(documento);
    if (saved.action === 'inserted') {
      resultado.itens_novos += 1;
      if (
        documento.texto_completo &&
        documento.texto_completo.length > 500 &&
        config.aiSchedulerEnabled &&
        process.env.PIPELINE_ENABLED !== 'true'
      ) {
        try {
          createResumoAiJob({
            documento_id: saved.id,
            contrato_versao: config.aiContractVersion,
            force: false,
          });
          const { scheduleResumoAiJobWorker } = require('../ai/summary-job-worker');
          scheduleResumoAiJobWorker();
        } catch (err) {
          logger.debug('Nao foi possivel criar job de resumo IA para doc novo', {
            erro: err.message,
          });
        }
      }
    } else if (saved.action === 'updated') {
      resultado.itens_atualizados += 1;
    } else if (saved.action === 'unchanged') {
      resultado.itens_sem_alteracao = (resultado.itens_sem_alteracao || 0) + 1;
    }
    return saved;
  }
}

module.exports = ColetorBase;
