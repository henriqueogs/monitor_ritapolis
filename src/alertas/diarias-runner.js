'use strict';

/**
 * Runner da vertente de diárias (agregada): carrega os empenhos de diárias, roda a vertente pelo
 * orquestrador e grava cada candidato em 'revisao' (nunca publica sozinho). Idempotente por
 * chave_unica (tipo de sinal + ano).
 */

const logger = require('../logger');
const repo = require('../db/diarias-repo');
const { upsertAlerta } = require('../db/alertas-repo');
const vertente = require('./vertentes/diarias');
const { rodarVertentes } = require('./vertentes/orquestrador');
const { persistirCandidatos } = require('./vertentes/persistencia');

function gerarDescobertasDiarias({ anoMin = 0, dryRun = false } = {}) {
  const { candidatos, resumo } = rodarVertentes(
    { empenhos: repo.listarEmpenhosDeDiarias({ anoMin }) },
    [vertente]
  );
  const info = resumo[vertente.nome];
  if (info.erro) {
    logger.error('diarias-runner: vertente falhou', { erro: info.erro });
  }
  const { gravados } = persistirCandidatos(candidatos, { upsert: upsertAlerta, dryRun });
  return {
    candidatos: candidatos.length,
    descartados: info.descartados,
    gravados,
    dryRun,
    lista: candidatos,
  };
}

module.exports = { gerarDescobertasDiarias };
