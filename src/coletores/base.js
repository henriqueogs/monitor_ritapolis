const crypto = require('crypto');
const { URL } = require('url');
const axios = require('axios');
const config = require('../config');
const logger = require('../logger');
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
        Accept: '*/*'
      },
      responseType: 'text',
      validateStatus: (status) => status >= 200 && status < 400,
      ...httpOptions
    });
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

  async requisitarComRetry(method, url, data, options = {}) {
    let lastError;

    for (let tentativa = 1; tentativa <= this.retryMax; tentativa += 1) {
      try {
        await this.respeitarDelay(url);
        const response = await this.http.request({
          method,
          url,
          data,
          ...options
        });
        return response;
      } catch (error) {
        lastError = error;
        logger.warn('Falha em requisicao, tentando novamente', {
          fonte: this.fonte,
          url,
          tentativa,
          erro: error.message
        });
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
    const response = await this.buscarComRetry(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  }

  resumirTexto(text) {
    if (!text) {return null;}
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
      itens_com_erro: 0,
      detalhes: []
    };

    try {
      await this.executar(resultado);
      resultado.status = resultado.itens_com_erro > 0 ? 'erro_parcial' : 'ok';
    } catch (error) {
      resultado.status = 'erro_total';
      resultado.detalhes.push({ etapa: 'execucao', erro: error.message });
      logger.error('Coleta falhou', {
        fonte: this.fonte,
        erro: error.message,
        stack: error.stack
      });
    } finally {
      resultado.fim = new Date().toISOString();
      finishColetaLog(logId, resultado);
    }

    return resultado;
  }

  registrarErroItem(resultado, contexto, error) {
    resultado.itens_com_erro += 1;
    resultado.detalhes.push({
      ...contexto,
      erro: error.message
    });
    logger.warn('Erro em item de coleta', {
      fonte: this.fonte,
      ...contexto,
      erro: error.message
    });
  }

  salvarDocumento(documento, resultado) {
    const saved = saveDocumento(documento);
    if (saved.action === 'inserted') {
      resultado.itens_novos += 1;
      if (documento.texto_completo && documento.texto_completo.length > 500 && config.aiSchedulerEnabled) {
        try {
          createResumoAiJob({ documento_id: saved.id, contrato_versao: config.aiContractVersion, force: false });
          const { scheduleResumoAiJobWorker } = require('../ai/summary-job-worker');
          scheduleResumoAiJobWorker();
        } catch (err) {
          logger.debug('Nao foi possivel criar job de resumo IA para doc novo', { erro: err.message });
        }
      }
    } else {
      resultado.itens_atualizados += 1;
    }
    return saved;
  }
}

module.exports = ColetorBase;
