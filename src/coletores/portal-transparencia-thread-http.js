'use strict';

/**
 * Camada de I/O do fluxo "thread" (ver portal-transparencia-thread.js pro
 * parsing puro e a memory reference_portal_transparencia_fluxo_thread pro
 * fluxo completo documentado).
 */

const axios = require('axios');
const config = require('../config');
const { checkpointInput, processRows } = require('./financial-resume');
const { createSafeHttpsAgent, assertSafeUrl } = require('../http/safe-network');
const { collectorProxyConfigured, proxyCollectorRequest } = require('../http/collector-proxy');
const {
  BASE_URL,
  extrairTokens,
  parseCsvDespesas,
  parseDetalhamentoDespesa,
} = require('./portal-transparencia-thread');
const { upsertDespesa, getDespesaPorEmpenho } = require('../db/transparencia-repo');
const { csvConfereComRegistro } = require('./despesa-csv');

// ponytail: delay fixo entre requisições — o fluxo faz várias por despesa
// (uma pra cada detalhamento). Ajustar se o portal reclamar de volume.
const DELAY_MS = Number(process.env.PORTAL_THREAD_DELAY_MS || 1200);
const TENTATIVAS_MAX_THREAD = 20;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function paraFormatoBr(dataIso) {
  const [ano, mes, dia] = String(dataIso).split('-');
  return `${dia}/${mes}/${ano}`;
}

function paraFormatoIso(dataBr) {
  if (!dataBr) {
    return null;
  }
  const [dia, mes, ano] = String(dataBr).trim().split('/');
  if (!dia || !mes || !ano) {
    return null;
  }
  return `${ano}-${mes}-${dia}`;
}

// Este cliente usa cookie de sessão por chamada (Cookie manual em cada
// request, não um cookie jar) — não passa por ColetorBase.buscarComRetry
// (que já roteia pelo proxy sozinho). Quando COLLECTOR_PROXY_URL/TOKEN
// estão configurados (ver src/http/collector-proxy.js — hoje necessário
// porque a Oracle Cloud é bloqueada pelo Cloudflare do portal, HTTP 403),
// o interceptor reescreve a request pra passar pelo Worker, preservando
// Cookie/Referer como headers normais.
function criarCliente(progress) {
  const cliente = axios.create({
    baseURL: BASE_URL,
    timeout: 20000,
    responseEncoding: 'latin1',
    httpsAgent: createSafeHttpsAgent(),
    validateStatus: status => status >= 200 && status < 400,
    maxContentLength: config.collectorMaxResponseBytes,
    maxBodyLength: config.collectorMaxResponseBytes,
    maxRedirects: config.collectorMaxRedirects,
    beforeRedirect: options =>
      assertSafeUrl(`${options.protocol}//${options.hostname}${options.path || '/'}`),
  });

  cliente.interceptors.request.use(requestConfig => {
    const alvo = axios.getUri(requestConfig);
    assertSafeUrl(alvo);
    progress?.checkTime();
    if (progress) {
      requestConfig.timeout = Math.min(requestConfig.timeout || 20000, progress.remainingMs());
    }
    if (!collectorProxyConfigured()) {
      return requestConfig;
    }
    const roteado = proxyCollectorRequest({
      method: requestConfig.method,
      url: alvo,
      options: { headers: requestConfig.headers },
    });
    requestConfig.baseURL = '';
    requestConfig.url = roteado.url;
    requestConfig.params = undefined;
    requestConfig.headers = { ...requestConfig.headers, ...roteado.options.headers };
    requestConfig.maxRedirects = 0;
    return requestConfig;
  });

  return cliente;
}

function extrairCookie(response) {
  const setCookie = response.headers['set-cookie'] || [];
  return setCookie.map(c => c.split(';')[0]).join('; ');
}

async function iniciarSessao(cliente) {
  assertSafeUrl(`${BASE_URL}/Tempo_Real_Despesa`);
  const resp = await cliente.get('/Tempo_Real_Despesa');
  const cookie = extrairCookie(resp);
  const tokens = extrairTokens(resp.data);
  if (!tokens || !cookie) {
    throw new Error('Portal de transparencia: sessao/tokens ausentes ao abrir Tempo_Real_Despesa');
  }
  return { cookie, ...tokens };
}

function montarCorpoBusca({ exercicio, dataInicial, dataFinal }) {
  const campos = {
    INT_PAG: '1',
    CHAR_ID_EMP: '1',
    INT_EXR: String(exercicio),
    ID8_DESP: '',
    D_DESP_DE: dataInicial,
    D_DESP_ATE: dataFinal,
    D_LQDC_DE: '',
    D_LQDC_ATE: '',
    D_PGT_DE: '',
    D_PGT_ATE: '',
    ID8_UND_OCT: '',
    ID2_FCAO: '',
    ID3_SFAO: '',
    ID4_PGM: '',
    ID4_PRAT: '',
    ID8_CT_DESP: '',
    ID3_FNTE: '',
    STR_ID_FNTE: '',
    STR_ID_CO_TCE: '',
    STR_ID_CO_AUX: '',
    ID2_T_DESP: '',
    NM_CDR: '',
    CNPJ_CDR: '',
    DESC_OBJ: '',
    TD_DESP: '',
    LG_ALT_PAG: 'N',
    URL: 'Tempo_Real_Despesa',
  };
  return new URLSearchParams(campos).toString();
}

async function iniciarThread(cliente, sessao, params) {
  const url = `/gerar_relatorio.php?Data=${Date.now()}&SHA1_TOKEN=${sessao.sha1Token}&INT_TOKEN=${sessao.intToken}`;
  assertSafeUrl(`${BASE_URL}${url}`);
  const resp = await cliente.post(url, montarCorpoBusca(params), {
    headers: {
      Cookie: sessao.cookie,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: `${BASE_URL}/Tempo_Real_Despesa`,
    },
  });
  const texto = String(resp.data || '');
  if (!texto.startsWith('001 - ')) {
    throw new Error(`Portal recusou a busca de despesas: ${texto.slice(0, 200)}`);
  }
  return texto.slice(6).trim();
}

async function aguardarResultado(cliente, sessao, threadId) {
  for (let tentativa = 0; tentativa < TENTATIVAS_MAX_THREAD; tentativa += 1) {
    await sleep(DELAY_MS);
    const resp = await cliente.post(
      `/Aguarda_Resultado_Thread.php?INT_THREAD=${threadId}&DataHora=${Date.now()}`,
      null,
      { headers: { Cookie: sessao.cookie } }
    );
    const texto = String(resp.data || '');
    if (texto.startsWith('001 - ')) {
      return texto.slice(6).trim();
    }
    if (texto.startsWith('000 - ')) {
      throw new Error(`Portal retornou erro na thread ${threadId}: ${texto.slice(6, 206)}`);
    }
  }
  throw new Error(`Timeout esperando resultado da thread ${threadId}`);
}

async function baixarCsv(cliente, sessao, pathResultadoHtml) {
  const hash = pathResultadoHtml.replace(/^\/Dados\//, '').replace(/\.html$/, '');
  const conversao = await cliente.get(`/converterPara.php?NM_ARQ=${hash}&FMT=CSV`, {
    headers: { Cookie: sessao.cookie },
  });
  const dados = typeof conversao.data === 'string' ? JSON.parse(conversao.data) : conversao.data;
  if (dados.FALHA) {
    throw new Error(`Falha ao gerar CSV do relatorio: ${dados.FALHA}`);
  }
  const csvResp = await cliente.get(dados.NM_ARQ_FIM, { headers: { Cookie: sessao.cookie } });
  return String(csvResp.data || '');
}

async function buscarDetalhe(cliente, sessao, { empenho, exercicio }) {
  const id8Desp = empenho.replace(/\D/g, '');
  await sleep(DELAY_MS);
  const resp = await cliente.get(
    `/Relatorios/Detalhamento_Despesa.php?ID8_DESP=${id8Desp}&STR_EXR_EXR=${exercicio}&CHAR_ID_EMP=1&LG_OP_DESP=N`,
    { headers: { Cookie: sessao.cookie } }
  );
  const detail = parseDetalhamentoDespesa(resp.data);
  if (!detail || detail.empenho !== empenho) {
    throw new Error(
      'Detalhamento financeiro ausente ou de outro empenho; dados existentes preservados'
    );
  }
  return detail;
}

/**
 * Coleta despesas de uma janela via o fluxo thread (sessão + geração
 * assíncrona + CSV), com um enriquecimento extra por empenho pra recuperar
 * os campos que o CSV não traz (CNPJ, histórico, categoria econômica).
 * @returns {{novos, atualizados, registros}}
 */
async function coletarDespesasJanelaViaThread(
  exercicio,
  dataInicialIso,
  dataFinalIso,
  { progress } = {}
) {
  const key = `expenses:${exercicio}:${dataInicialIso}:${dataFinalIso}`;
  const cliente = criarCliente(progress);
  let sessao;
  const session = async () => {
    sessao ||= await iniciarSessao(cliente);
    return sessao;
  };
  const linhas = await checkpointInput(progress, key, async () => {
    const sessao = await session();
    const threadId = await iniciarThread(cliente, sessao, {
      exercicio,
      dataInicial: paraFormatoBr(dataInicialIso),
      dataFinal: paraFormatoBr(dataFinalIso),
    });
    const pathResultado = await aguardarResultado(cliente, sessao, threadId);
    const csv = await baixarCsv(cliente, sessao, pathResultado);
    return parseCsvDespesas(csv);
  });
  return processRows(
    progress,
    key,
    linhas,
    async item => {
      if (Number(item.exercicio) !== Number(exercicio)) {
        throw new Error('Exercicio do empenho diverge da janela consultada');
      }
      const volateis = {
        tipo: item.tipo,
        dataEmpenho: paraFormatoIso(item.dataEmpenho),
        dataLiquidacao: paraFormatoIso(item.dataLiquidacao),
        dataPagamento: paraFormatoIso(item.dataPagamento),
        valor: item.valor,
        credorNomeParcial: item.credorNomeParcial,
      };
      if (csvConfereComRegistro(volateis, getDespesaPorEmpenho(exercicio, item.empenho))) {
        return { jaConfere: true };
      }
      const detalhe = await buscarDetalhe(cliente, await session(), {
        empenho: item.empenho,
        exercicio,
      });
      return {
        empenho: item.empenho,
        exercicio,
        tipo: item.tipo,
        dataDoEmpenho: paraFormatoIso(item.dataEmpenho),
        dataDeLiquidacao: paraFormatoIso(item.dataLiquidacao),
        dataDePagamento: paraFormatoIso(item.dataPagamento),
        valor: item.valor,
        credor: detalhe.credor || item.credorNomeParcial,
        unidade: detalhe?.unidade,
        funcao: detalhe?.funcao,
        subfuncao: detalhe?.subfuncao,
        programa: detalhe?.programa,
        projetoAtividade: detalhe?.projetoAtividade,
        categoriaEconomica: detalhe?.categoriaEconomica,
        fonteDeRecurso: detalhe?.fonteDeRecurso,
        coTce: detalhe?.coTce,
        coAux: detalhe?.coAux,
        historico: detalhe?.historico,
      };
    },
    row => (row.jaConfere ? 'unchanged' : upsertDespesa(row))
  );
}

module.exports = {
  paraFormatoBr,
  paraFormatoIso,
  coletarDespesasJanelaViaThread,
};
