'use strict';

/**
 * Runner da vertente "empenhado acima do contratado". Carrega processos e empenhos, roda a
 * vertente pelo orquestrador e grava cada candidato em 'revisao' (nunca publica sozinho).
 * Idempotente por chave_unica; decisões humanas (rejeitado/publicado com as mesmas evidências)
 * são preservadas pelo upsert. Regras e evidências vivem em vertentes/execucao-contratual.js.
 */

const logger = require('../logger');
const repo = require('../db/execucao-contratual-repo');
const { getDespesasPorIds } = require('../db/transparencia-agregados-repo');
const { upsertAlerta } = require('../db/alertas-repo');
const vertente = require('./vertentes/execucao-contratual');
const { rodarVertentes } = require('./vertentes/orquestrador');
const { persistirCandidatos } = require('./vertentes/persistencia');

// Junta a cada processo os anexos de contrato dele (fontes do valor).
function processosComFontes() {
  const anexosPorDocumento = new Map();
  for (const anexo of repo.listarAnexosDeContrato()) {
    const lista = anexosPorDocumento.get(anexo.documento_id) || [];
    lista.push(anexo);
    anexosPorDocumento.set(anexo.documento_id, lista);
  }
  return repo.listarProcessosComTextoContrato().map(processo => ({
    ...processo,
    fontes: anexosPorDocumento.get(processo.documento_id) || [],
  }));
}

function gerarDescobertasExecucao({ dryRun = false } = {}) {
  const processos = processosComFontes();
  const empenhos = repo.listarEmpenhosQueCitamProcesso();
  const ids = [...new Set(empenhos.map(e => e.id))];
  const empenhosPorId = new Map(getDespesasPorIds(ids).map(d => [d.id, d]));
  const { candidatos, resumo } = rodarVertentes({ processos, empenhos, empenhosPorId }, [vertente]);
  const info = resumo[vertente.nome];
  if (info.erro) {
    logger.error('execucao-contratual-runner: vertente falhou', { erro: info.erro });
  }
  const { gravados } = persistirCandidatos(candidatos, { upsert: upsertAlerta, dryRun });
  return { sinais: candidatos.map(c => c.sinal), gravados, dryRun };
}

module.exports = { gerarDescobertasExecucao, sinalParaAlerta: vertente.sinalParaAlerta };
