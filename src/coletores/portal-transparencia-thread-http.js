'use strict';

/**
 * Camada de I/O do fluxo "thread" (ver portal-transparencia-thread.js pro
 * parsing puro e a memory reference_portal_transparencia_fluxo_thread pro
 * fluxo completo documentado).
 */

const axios = require('axios');
const logger = require('../logger');
const { createSafeHttpsAgent, assertSafeUrl } = require('../http/safe-network');
const { collectorProxyConfigured, proxyCollectorRequest } = require('../http/collector-proxy');
const {
  BASE_URL,
  extrairTokens,
  parseCsvDespesas,
  parseDetalhamentoDespesa,
} = require('./portal-transparencia-thread');
const { upsertDespesa } = require('../db/transparencia-repo');

// ponytail: delay fixo entre requisições — o fluxo faz várias por despesa
// (uma pra cada detalhamento). Ajustar se o portal reclamar de volume.
const DELAY_MS = Number(process.env.PORTAL_THREAD_DELAY_MS || 1200);
const TENTATIVAS_MAX_THREAD = 20;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
function criarCliente() {
  const cliente = axios.create({
    baseURL: BASE_URL,
    timeout: 20000,
    responseEncoding: 'latin1',
    httpsAgent: createSafeHttpsAgent(),
    validateStatus: (status) => status >= 200 && status < 400,
  });

  if (collectorProxyConfigured()) {
    cliente.interceptors.request.use((requestConfig) => {
      const alvo = axios.getUri(requestConfig);
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
  }

  return cliente;
}

function extrairCookie(response) {
  const setCookie = response.headers['set-cookie'] || [];
  return setCookie.map((c) => c.split(';')[0]).join('; ');
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
    INT_PAG: '1', CHAR_ID_EMP: '1', INT_EXR: String(exercicio), ID8_DESP: '',
    D_DESP_DE: dataInicial, D_DESP_ATE: dataFinal,
    D_LQDC_DE: '', D_LQDC_ATE: '', D_PGT_DE: '', D_PGT_ATE: '',
    ID8_UND_OCT: '', ID2_FCAO: '', ID3_SFAO: '', ID4_PGM: '', ID4_PRAT: '',
    ID8_CT_DESP: '', ID3_FNTE: '', STR_ID_FNTE: '', STR_ID_CO_TCE: '', STR_ID_CO_AUX: '',
    ID2_T_DESP: '', NM_CDR: '', CNPJ_CDR: '', DESC_OBJ: '', TD_DESP: '',
    LG_ALT_PAG: 'N', URL: 'Tempo_Real_Despesa',
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
  return parseDetalhamentoDespesa(resp.data);
}

/**
 * Coleta despesas de uma janela via o fluxo thread (sessão + geração
 * assíncrona + CSV), com um enriquecimento extra por empenho pra recuperar
 * os campos que o CSV não traz (CNPJ, histórico, categoria econômica).
 * @returns {{novos, atualizados, registros}}
 */
async function coletarDespesasJanelaViaThread(exercicio, dataInicialIso, dataFinalIso) {
  const cliente = criarCliente();
  const sessao = await iniciarSessao(cliente);
  const threadId = await iniciarThread(cliente, sessao, {
    exercicio,
    dataInicial: paraFormatoBr(dataInicialIso),
    dataFinal: paraFormatoBr(dataFinalIso),
  });
  const pathResultado = await aguardarResultado(cliente, sessao, threadId);
  const csv = await baixarCsv(cliente, sessao, pathResultado);
  const linhas = parseCsvDespesas(csv);

  let novos = 0;
  let atualizados = 0;
  for (const item of linhas) {
    let detalhe = null;
    try {
      detalhe = await buscarDetalhe(cliente, sessao, { empenho: item.empenho, exercicio });
    } catch (err) {
      logger.warn('portal-transparencia (thread): falha ao buscar detalhamento, salvando com dados parciais', {
        empenho: item.empenho, exercicio, erro: err.message,
      });
    }

    const action = upsertDespesa({
      empenho: item.empenho,
      exercicio,
      tipo: item.tipo,
      dataDoEmpenho: paraFormatoIso(item.dataEmpenho),
      dataDeLiquidacao: paraFormatoIso(item.dataLiquidacao),
      dataDePagamento: paraFormatoIso(item.dataPagamento),
      valor: item.valor,
      credor: detalhe?.credor || item.credorNomeParcial,
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
    });
    if (action === 'inserted') {novos += 1;}
    else if (action === 'updated') {atualizados += 1;}
  }

  return { novos, atualizados, registros: linhas.length };
}

module.exports = {
  paraFormatoBr,
  paraFormatoIso,
  coletarDespesasJanelaViaThread,
};
