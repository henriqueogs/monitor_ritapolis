'use strict';

/**
 * Consulta cadastral de CNPJ na BrasilAPI (espelho de dados abertos da Receita
 * Federal). Sem autenticação; CNPJ e cadastro empresarial são dados públicos.
 * O resultado alimenta o cache auditável credores_enriquecimentos (fonte
 * receita_cnpj), lido por montarEnriquecimentoCredor.
 */

const axios = require('axios');
const config = require('../config');

const FONTE = 'receita_cnpj';

function apenasDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function mapearQsa(qsa) {
  if (!Array.isArray(qsa)) { return []; }
  return qsa
    .map((socio) => ({
      nome: socio.nome_socio || socio.nome || null,
      qualificacao: socio.qualificacao_socio || socio.qualificacao || null,
    }))
    .filter((socio) => socio.nome);
}

/**
 * Normaliza a resposta da BrasilAPI para o formato esperado pelo display
 * (natureza_juridica, situacao_cadastral, qsa) mais alguns campos de contexto.
 */
function mapearReceitaCnpj(data = {}) {
  return {
    razao_social: data.razao_social || data.nome_fantasia || null,
    natureza_juridica: data.natureza_juridica || null,
    situacao_cadastral: data.descricao_situacao_cadastral || null,
    cnae: data.cnae_fiscal_descricao || null,
    municipio: data.municipio || null,
    uf: data.uf || null,
    qsa: mapearQsa(data.qsa),
  };
}

async function httpGetPadrao(cnpj) {
  const response = await axios.get(`${config.receitaCnpjBaseUrl}/${cnpj}`, {
    timeout: config.collectorTimeoutMs,
    headers: { accept: 'application/json', 'user-agent': config.collectorUserAgent },
  });
  return response.data;
}

/**
 * Busca e normaliza o cadastro de um CNPJ. `httpGet` é injetável para testes.
 * @returns {{ dados: object, confianca: number } | null} null quando 404.
 */
async function buscarCnpj(cnpj, { httpGet = httpGetPadrao } = {}) {
  const limpo = apenasDigitos(cnpj);
  if (limpo.length !== 14) {
    throw new Error(`CNPJ invalido: ${cnpj}`);
  }
  try {
    const data = await httpGet(limpo);
    const dados = mapearReceitaCnpj(data);
    const confianca = dados.situacao_cadastral ? 0.9 : 0.6;
    return { dados, confianca };
  } catch (err) {
    if (err.response?.status === 404) { return null; }
    throw new Error(`BrasilAPI CNPJ ${limpo} falhou: ${err.message}`, { cause: err });
  }
}

module.exports = {
  FONTE,
  apenasDigitos,
  mapearReceitaCnpj,
  buscarCnpj,
};
