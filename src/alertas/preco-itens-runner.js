'use strict';

/**
 * Runner da vertente "preço acima da referência": carrega os itens de nota fiscal, roda a
 * vertente pelo orquestrador e grava cada candidato em 'revisao' (nunca publica sozinho).
 * Idempotente por chave_unica (produto + unidade + período).
 */

const logger = require('../logger');
const repo = require('../db/preco-itens-repo');
const { upsertAlerta } = require('../db/alertas-repo');
const vertente = require('./vertentes/preco-itens');
const { rodarVertentes } = require('./vertentes/orquestrador');
const { persistirCandidatos } = require('./vertentes/persistencia');

function gerarDescobertasPreco({ anoMin = 0, dryRun = false } = {}) {
  const { candidatos, resumo } = rodarVertentes(
    { itens: repo.listarItensComparaveis({ anoMin }) },
    [vertente]
  );
  const info = resumo[vertente.nome];
  if (info.erro) {
    logger.error('preco-itens-runner: vertente falhou', { erro: info.erro });
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

module.exports = { gerarDescobertasPreco };
