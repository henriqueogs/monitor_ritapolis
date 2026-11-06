'use strict';

/**
 * Runner da vertente "compras repetidas". Carrega empenhos originais e os CNPJs com instrumento
 * (licitação, contrato ou ata no acervo), roda a vertente pelo orquestrador e grava cada
 * candidato em 'revisao' (nunca publica sozinho). Idempotente por chave_unica.
 * "Instrumento" é avaliado por credor, não por período/objeto: critério conservador, que
 * descarta mais candidatos para não afirmar lacuna onde existe contrato.
 */

const logger = require('../logger');
const repo = require('../db/compras-repetidas-repo');
const { upsertAlerta } = require('../db/alertas-repo');
const vertente = require('./vertentes/compras-repetidas');
const { rodarVertentes } = require('./vertentes/orquestrador');
const { persistirCandidatos } = require('./vertentes/persistencia');

function gerarDescobertasComprasRepetidas({ dryRun = false } = {}) {
  const contexto = {
    empenhos: repo.listarEmpenhosOriginais(),
    credoresComInstrumento: repo.listarCnpjsComInstrumento(),
  };
  const { candidatos, resumo } = rodarVertentes(contexto, [vertente]);
  const info = resumo[vertente.nome];
  if (info.erro) {
    logger.error('compras-repetidas-runner: vertente falhou', { erro: info.erro });
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

module.exports = { gerarDescobertasComprasRepetidas };
