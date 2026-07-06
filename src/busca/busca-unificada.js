'use strict';

/**
 * Busca unificada: um termo, três índices — documentos (FTS do acervo),
 * empenhos (FTS de despesas) e credores (nome). Cada seção falha isolada:
 * um índice indisponível não derruba os outros.
 */

const logger = require('../logger');
const { searchDocumentos } = require('../db/fts-repo');
const { getDespesas } = require('../db/transparencia-repo');
const { listCredores } = require('../db/credores-repo');

const LIMITE_POR_SECAO = 5;
const SECAO_VAZIA = { total: 0, dados: [] };

function secaoSegura(nome, fn) {
  try {
    const r = fn();
    return { total: r.total || 0, dados: r.dados || [] };
  } catch (err) {
    logger.warn('busca-unificada: seção falhou', { secao: nome, erro: err.message });
    return { ...SECAO_VAZIA };
  }
}

function buscaUnificada(q, { limite = LIMITE_POR_SECAO } = {}) {
  return {
    q,
    documentos: secaoSegura('documentos', () => searchDocumentos(q, { limite })),
    empenhos: secaoSegura('empenhos', () => getDespesas({ q, limite })),
    credores: secaoSegura('credores', () => listCredores({ busca: q, limite })),
  };
}

module.exports = { buscaUnificada, LIMITE_POR_SECAO };
