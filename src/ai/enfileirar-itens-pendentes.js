'use strict';

// Seleção + enfileiramento pro backfill controlado de reextração de itens
// (Fase G). Não chama a IA diretamente — só decide QUEM entra na fila
// (documentos_itens_estruturacao_ai_jobs); quem processa é o worker
// (itens-processo-job-worker.js), um job por vez.

const { getDocumentoById } = require('../db');
const {
  listDocumentosPendentesItens,
  getUltimoItensEstruturadosPorDocumento,
  createItensEstruturacaoJob,
} = require('../db/itens-estruturacao-jobs-repo');
const { listarAtasDoDocumento, computeInputHash, CONTRACT_VERSION, assessItemsResult } = require('./estruturar-itens-processo');
const { createAiProvider } = require('./providers');

function jaProcessadoComTextoAtual(documento, atas) {
  const ultimo = getUltimoItensEstruturadosPorDocumento(documento.id);
  return assessItemsResult(ultimo, documento, atas).valid;
}

async function enfileirarItensPendentes({
  limite = 20,
  ano = undefined,
  fonte = undefined,
  documentoId = null,
  force = false,
  dryRun = false,
} = {}) {
  const candidatos = documentoId
    ? [getDocumentoById(documentoId)].filter(Boolean)
    : listDocumentosPendentesItens({ limite, ano, fonte });

  const provider = createAiProvider();
  const enfileirados = [];
  const jaProcessados = [];

  for (const documento of candidatos) {
    const atas = listarAtasDoDocumento(documento.id);
    const textoHash = computeInputHash(documento, atas);

    if (!force && jaProcessadoComTextoAtual(documento, atas)) {
      jaProcessados.push({ documento_id: documento.id });
      continue;
    }

    let jobId = null;
    if (!dryRun) {
      const job = createItensEstruturacaoJob({
        documento_id: documento.id,
        provider: provider.provider,
        modelo: provider.model,
        contrato_versao: CONTRACT_VERSION,
        texto_hash: textoHash,
        force,
      });
      jobId = job.id;
    }
    enfileirados.push({ documento_id: documento.id, titulo: documento.titulo, job_id: jobId });
  }

  return {
    dry_run: dryRun,
    total_selecionados: candidatos.length,
    selecionados: candidatos.map((d) => ({ documento_id: d.id, titulo: d.titulo })),
    enfileirados,
    ja_processados: jaProcessados,
  };
}

module.exports = { enfileirarItensPendentes };
