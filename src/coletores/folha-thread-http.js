'use strict';

/**
 * Camada de I/O do fluxo "thread" pro relatório de Folha Salarial —
 * mesmo protocolo já usado em portal-transparencia-thread-http.js
 * (sessão + token por carregamento + geração assíncrona + CSV), módulo
 * "Folha" do Portal da Transparência em vez de "Tempo_Real_Despesa".
 *
 * ponytail: duplica as ~5 primitivas HTTP em vez de generalizar o arquivo
 * de despesas — esse scraper de terceiro já quebrou uma vez em produção
 * (ver header de portal-transparencia-thread-http.js); menor raio de
 * explosão duplicar do que arriscar as duas features numa refatoração
 * genérica de um sistema frágil. Sem teste unitário aqui, mesmo padrão do
 * arquivo espelhado — validar com smoke test manual ao vivo antes de
 * ligar no scheduler.
 */

const axios = require('axios');
const { createSafeHttpsAgent, assertSafeUrl } = require('../http/safe-network');
const { collectorProxyConfigured, proxyCollectorRequest } = require('../http/collector-proxy');
const { BASE_URL, extrairTokens } = require('./portal-transparencia-thread');
const { parseCsvFolha } = require('./folha-thread');
const { upsertFolhaRegistro } = require('../db/folha-repo');

const TENTATIVAS_MAX_THREAD = 20;
const DELAY_MS = Number(process.env.PORTAL_THREAD_DELAY_MS || 1200);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mesmo cliente/roteamento de proxy que portal-transparencia-thread-http.js
// (Oracle Cloud é bloqueada pelo Cloudflare do portal, HTTP 403, sem passar
// pelo Worker configurado em COLLECTOR_PROXY_URL/TOKEN).
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

async function iniciarSessaoFolha(cliente) {
  assertSafeUrl(`${BASE_URL}/Folha`);
  const resp = await cliente.get('/Folha');
  const cookie = extrairCookie(resp);
  const tokens = extrairTokens(resp.data);
  if (!tokens || !cookie) {
    throw new Error('Portal de transparencia (folha): sessao/tokens ausentes ao abrir /Folha');
  }
  return { cookie, ...tokens };
}

// Campos confirmados no <form id='cns'> de /Folha -- exercicio fixo, resto
// em branco/coringa pra trazer todos os servidores/meses do exercicio.
function montarCorpoBuscaFolha({ exercicio }) {
  const campos = {
    INT_PAG: '1', Mes: '%', INT_EXR: String(exercicio),
    ID7_FUNC: '', INT_PSSOA: '', NM_FUNC: '', STR_TFA_FUNC: '', NM_TST_FUNC: '%',
    ID5_CGO: '', INT_SGLA_CGO: '', ID5_FCAO: '', NM_SEC: '', STR_LOT: '', LG_PENS_FUNC: '',
    LG_ALT_PAG: 'N', URL: 'Folha',
  };
  return new URLSearchParams(campos).toString();
}

async function iniciarThreadFolha(cliente, sessao, { exercicio }) {
  const url = `/gerar_relatorio.php?Data=${Date.now()}&SHA1_TOKEN=${sessao.sha1Token}&INT_TOKEN=${sessao.intToken}`;
  assertSafeUrl(`${BASE_URL}${url}`);
  const resp = await cliente.post(url, montarCorpoBuscaFolha({ exercicio }), {
    headers: {
      Cookie: sessao.cookie,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: `${BASE_URL}/Folha`,
    },
  });
  const texto = String(resp.data || '');
  if (!texto.startsWith('001 - ')) {
    throw new Error(`Portal recusou a busca de folha: ${texto.slice(0, 200)}`);
  }
  return texto.slice(6).trim();
}

async function aguardarResultadoFolha(cliente, sessao, threadId) {
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

async function baixarCsvFolha(cliente, sessao, pathResultadoHtml) {
  const hash = pathResultadoHtml.replace(/^\/Dados\//, '').replace(/\.html$/, '');
  const conversao = await cliente.get(`/converterPara.php?NM_ARQ=${hash}&FMT=CSV`, {
    headers: { Cookie: sessao.cookie },
  });
  const dados = typeof conversao.data === 'string' ? JSON.parse(conversao.data) : conversao.data;
  if (dados.FALHA) {
    throw new Error(`Falha ao gerar CSV da folha: ${dados.FALHA}`);
  }
  // O CSV do relatorio de Folha vem em UTF-8 (confirmado via bytes crus --
  // "content-type: text/csv" sem charset, mas 0xC3 0xAD = 'í' em UTF-8), ao
  // contrario das paginas HTML do mesmo portal (ISO-8859-1, por isso o
  // cliente usa 'latin1' por padrao). Sem esse override os rotulos
  // acentuados ("Vínculo:", "Situação:") viram mojibake e o parser de
  // blocos falha silenciosamente (0 registros, sem excecao).
  const csvResp = await cliente.get(dados.NM_ARQ_FIM, {
    headers: { Cookie: sessao.cookie },
    responseEncoding: 'utf8',
  });
  return String(csvResp.data || '');
}

/**
 * Coleta a folha salarial de um exercício inteiro (todos os servidores,
 * todos os meses — Mes='%') via o fluxo thread. Sem janelamento: o CSV de
 * um ano inteiro fica em torno de 1MB, bem abaixo do que exige janelas
 * semanais como despesas.
 * @returns {{novos, atualizados, registros}}
 */
async function coletarFolhaExercicioViaThread(exercicio) {
  const cliente = criarCliente();
  const sessao = await iniciarSessaoFolha(cliente);
  const threadId = await iniciarThreadFolha(cliente, sessao, { exercicio });
  const pathResultado = await aguardarResultadoFolha(cliente, sessao, threadId);
  const csv = await baixarCsvFolha(cliente, sessao, pathResultado);
  const registros = parseCsvFolha(csv);

  let novos = 0;
  let atualizados = 0;
  for (const registro of registros) {
    const action = upsertFolhaRegistro(registro);
    if (action === 'inserted') { novos += 1; }
    else if (action === 'updated') { atualizados += 1; }
  }

  return { novos, atualizados, registros: registros.length };
}

module.exports = { coletarFolhaExercicioViaThread };
