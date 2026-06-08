const axios = require('axios');
const config = require('../config');

async function get(path, params = {}) {
  const response = await axios.get(`${config.pncpOrgaosUrl}${path}`, {
    params,
    timeout: config.collectorTimeoutMs,
    headers: {
      accept: 'application/json',
      'user-agent': config.collectorUserAgent
    }
  });
  return response.data;
}

async function listarComprasPorCnpj(cnpj, { ano, pagina = 1, tamanhoPagina = 50 } = {}) {
  const params = { pagina, tamanhoPagina };
  if (ano) params.ano = ano;
  const data = await get(`/orgaos/${cnpj}/compras`, params);
  return {
    items: data.data || [],
    totalRegistros: data.totalRegistros || 0,
    totalPaginas: data.totalPaginas || 1,
    paginaAtual: data.numeroPagina || pagina
  };
}

async function listarItensCompra(cnpj, ano, sequencial, { pagina = 1, tamanhoPagina = 50 } = {}) {
  const data = await get(`/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens`, { pagina, tamanhoPagina });
  return {
    items: data.data || [],
    totalRegistros: data.totalRegistros || 0
  };
}

async function buscarResultadosItem(cnpj, ano, sequencial, numeroItem) {
  const data = await get(`/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens/${numeroItem}/resultados`);
  return Array.isArray(data) ? data : data?.data || [];
}

async function listarContratosPorCnpj(cnpj, { ano, pagina = 1, tamanhoPagina = 50 } = {}) {
  const params = { pagina, tamanhoPagina };
  if (ano) params.ano = ano;
  const data = await get(`/orgaos/${cnpj}/contratos`, params);
  return {
    items: data.data || [],
    totalRegistros: data.totalRegistros || 0,
    totalPaginas: data.totalPaginas || 1
  };
}

// Extrai { cnpj, tipo, sequencial, ano } de "18557553000105-1-000068/2024"
function parsePncpNumeroControle(numero) {
  if (!numero) return null;
  const match = String(numero).match(/^(\d{14})-(\d+)-0*(\d+)\/(\d{4})$/);
  if (!match) return null;
  return { cnpj: match[1], tipo: match[2], sequencial: match[3], ano: match[4] };
}

// Encontra o resultado homologado em uma lista de resultados de item
function extrairVencedorResultados(resultados) {
  if (!resultados?.length) return null;
  return (
    resultados.find((r) => r.valorTotalHomologado != null && r.situacaoCompraItemResultadoNome?.toLowerCase().includes('homolog')) ||
    resultados.find((r) => r.valorTotalHomologado != null) ||
    null
  );
}

module.exports = {
  listarComprasPorCnpj,
  listarItensCompra,
  buscarResultadosItem,
  listarContratosPorCnpj,
  parsePncpNumeroControle,
  extrairVencedorResultados
};
