'use strict';

/**
 * Runner da vertente de legislação: carrega leis e normas, roda a vertente pelo orquestrador e
 * grava cada candidato em 'revisao' (nunca publica sozinho). Idempotente por chave_unica.
 */

const logger = require('../logger');
const repo = require('../db/legislacao-repo');
const { upsertAlerta } = require('../db/alertas-repo');
const vertente = require('./vertentes/legislacao');
const { rodarVertentes } = require('./vertentes/orquestrador');
const { persistirCandidatos } = require('./vertentes/persistencia');

function gerarDescobertasLegislacao({ anoMin = 0, dryRun = false } = {}) {
  const { candidatos, resumo } = rodarVertentes(
    { leis: repo.listarLeisOrdinarias(), normas: repo.listarNormasComTexto({ anoMin }) },
    [vertente]
  );
  const info = resumo[vertente.nome];
  if (info.erro) {
    logger.error('legislacao-runner: vertente falhou', { erro: info.erro });
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

module.exports = { gerarDescobertasLegislacao };
