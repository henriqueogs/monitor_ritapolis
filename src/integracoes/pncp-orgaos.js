/**
 * Integração com o PNCP via API de Consulta Pública.
 *
 * ATENÇÃO: A API /pncp-api/v1/orgaos/ é para ESCRITA (órgãos submetendo dados).
 * Para leitura pública, usamos /api/consulta/v1/ — sem autenticação.
 *
 * Ritápolis publica majoritariamente no site próprio. O PNCP tem dados pontuais:
 * pelo menos 1 Pregão Eletrônico (2025/1) da Prefeitura foi publicado lá.
 * O ColetorPncp (src/coletores/pncp.js) busca via /orgaos/{cnpj}/compras/{ano}/{seq}.
 */

const axios = require('axios');
const config = require('../config');

const CONSULTA_BASE = config.pncpBaseUrl || 'https://pncp.gov.br/api/consulta';
const API_BASE = config.pncpApiUrl || 'https://pncp.gov.br/api/pncp';
const ITENS_POR_PAGINA = 50;

// Todas as modalidades usadas por municípios
const MODALIDADES = [
  6,  // Pregão Eletrônico
  7,  // Pregão Presencial
  8,  // Dispensa
  9,  // Inexigibilidade
  4,  // Concorrência Eletrônica
  5,  // Concorrência Presencial
  12, // Credenciamento
];

async function get(path, params = {}) {
  const response = await axios.get(`${CONSULTA_BASE}${path}`, {
    params,
    timeout: config.collectorTimeoutMs,
    headers: {
      accept: 'application/json',
      'user-agent': config.collectorUserAgent
    }
  });
  if (response.status === 204) {return null;}
  return response.data;
}

/**
 * Busca contratações no PNCP para um período (máximo 365 dias).
 * @returns {{ items: Array, totalRegistros: number, totalPaginas: number } | null}
 */
async function buscarContratacoes({ cnpj, codigoMunicipioIbge, codigoModalidadeContratacao, dataInicial, dataFinal, pagina = 1, tamanhoPagina = 50 } = {}) {
  const params = {
    dataInicial,
    dataFinal,
    codigoModalidadeContratacao,
    pagina,
    tamanhoPagina: Math.max(tamanhoPagina, 10)
  };
  if (cnpj) {params.cnpj = String(cnpj).replace(/\D/g, '');}
  if (codigoMunicipioIbge) {params.codigoMunicipioIbge = codigoMunicipioIbge;}

  const data = await get('/v1/contratacoes/publicacao', params);
  if (!data) {return null;}

  const items = data.data || data.content || [];
  return {
    items,
    totalRegistros: data.totalRegistros ?? data.total ?? items.length,
    totalPaginas: data.totalPaginas ?? (Math.ceil((data.totalRegistros || items.length) / tamanhoPagina) || 1)
  };
}

/**
 * Verifica se um município tem dados publicados no PNCP para o ano dado.
 * Retorna o total de registros encontrados (0 = não publica no PNCP).
 */
async function verificarCoberturaMunicipio({ codigoMunicipioIbge, cnpj, ano } = {}) {
  const dataInicial = `${ano}0101`;
  const dataFinal = `${ano}1231`;

  let totalEncontrado = 0;
  for (const modalidade of MODALIDADES) {
    try {
      const result = await buscarContratacoes({
        cnpj,
        codigoMunicipioIbge,
        codigoModalidadeContratacao: modalidade,
        dataInicial,
        dataFinal,
        pagina: 1,
        tamanhoPagina: 10
      });
      if (result?.totalRegistros > 0) {totalEncontrado += result.totalRegistros;}
    } catch {
      // modalidade sem dados ou API instável
    }
  }
  return totalEncontrado;
}

/**
 * Busca todas as contratações de um CNPJ num ano, iterando por todas as modalidades.
 * @yields {{ modalidade, items[] }}
 */
async function* gerarContratacoesPorCnpj(cnpj, ano) {
  const dataInicial = `${ano}0101`;
  const dataFinal = `${ano}1231`;

  for (const modalidade of MODALIDADES) {
    let pagina = 1;
    while (true) {
      // Erro de rede/HTTP propaga: quem chama conta como falha (antes virava "0 resultados").
      const resp = await buscarContratacoes({ cnpj, codigoModalidadeContratacao: modalidade, dataInicial, dataFinal, pagina });
      if (!resp || !resp.items.length) {break;}

      yield { modalidade, items: resp.items };

      if (pagina >= resp.totalPaginas) {break;}
      pagina++;
    }
  }
}

// GET na API /api/pncp/v1 (leitura pública por órgão). 204/404 = sem dados.
async function getApi(caminho, params) {
  const response = await axios.get(`${API_BASE}${caminho}`, {
    params,
    timeout: config.collectorTimeoutMs,
    validateStatus: (status) => status < 500,
    headers: { accept: 'application/json', 'user-agent': config.collectorUserAgent },
  });
  if (response.status === 204 || response.status === 404) {return null;}
  if (response.status >= 400) {throw new Error(`PNCP HTTP ${response.status} em ${caminho}`);}
  return response.data;
}

/**
 * Itens de uma compra com os resultados (fornecedor e valor homologado) de cada um.
 * Resultados só são buscados para itens com temResultado, para não gastar chamadas.
 */
async function buscarItensComResultados({ cnpj, ano, sequencial }) {
  const base = `/v1/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens`;
  const itens = [];
  for (let pagina = 1; ; pagina++) {
    const lote = (await getApi(base, { pagina, tamanhoPagina: ITENS_POR_PAGINA })) || [];
    itens.push(...lote);
    if (lote.length < ITENS_POR_PAGINA) {break;}
  }
  const completos = [];
  for (const item of itens) {
    const resultados = item.temResultado
      ? (await getApi(`${base}/${item.numeroItem}/resultados`)) || []
      : [];
    completos.push({ ...item, resultados });
  }
  return completos;
}

// Extrai o número de controle PNCP de um item da API de consulta
function extrairNumeroPncp(item) {
  return item?.numeroControlePNCP || item?.numeroControlePncpCompra || null;
}

module.exports = {
  buscarContratacoes,
  buscarItensComResultados,
  verificarCoberturaMunicipio,
  gerarContratacoesPorCnpj,
  extrairNumeroPncp,
  MODALIDADES
};
