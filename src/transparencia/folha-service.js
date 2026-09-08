'use strict';

/**
 * Service da folha salarial — composição fina sobre folha-repo.js, decora
 * cada resultado com o link de origem (§11.3). Sem cálculo de negócio
 * pesado aqui; as agregações reais ficam no repo (SQL faz o trabalho).
 */

const {
  getFolhaServidores,
  getFolhaServidorDossie,
  getFolhaResumoSecretarias,
} = require('../db/folha-repo');
const { buildPortalFolhaLink } = require('./portal-links');

function comLinkPortalFolha(rows) {
  if (!Array.isArray(rows)) { return []; }
  const portal = buildPortalFolhaLink();
  return rows.map((row) => ({ ...row, portal }));
}

function listarServidores(filtros) {
  const resultado = getFolhaServidores(filtros);
  return { ...resultado, dados: comLinkPortalFolha(resultado.dados) };
}

function getServidorDossie({ vinculo, matricula }) {
  const historico = getFolhaServidorDossie({ vinculo, matricula });
  if (!historico.length) { return null; }
  return { vinculo, matricula, historico: comLinkPortalFolha(historico) };
}

function getResumoSecretarias(filtros) {
  return getFolhaResumoSecretarias(filtros);
}

module.exports = { listarServidores, getServidorDossie, getResumoSecretarias };
