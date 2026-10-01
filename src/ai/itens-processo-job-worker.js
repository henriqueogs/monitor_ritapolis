'use strict';

// Worker do job de reextração de itens do processo — mesmo padrão de
// anexo-summary-job-worker.js: processa um job por vez, nunca concorrente,
// para respeitar o rate limit da NVIDIA.

const logger = require('../logger');
const {
  getNextPendingItensEstruturacaoJob,
  markItensEstruturacaoJobProcessing,
  finishItensEstruturacaoJobOk,
  finishItensEstruturacaoJobError,
  recoverStaleItensEstruturacaoJobs,
} = require('../db/itens-estruturacao-jobs-repo');
const { getDocumentoById } = require('../db/index');
const { estruturarItensProcesso, computeInputHash, listarAtasDoDocumento, CONTRACT_VERSION } = require('./estruturar-itens-processo');

let workerRunning = false;

async function processJob(job, { progress } = {}) {
  const lockedJob = markItensEstruturacaoJobProcessing(job.id);
  if (!lockedJob || lockedJob.status !== 'processando') {
    return;
  }

  try {
    const documento = getDocumentoById(lockedJob.documento_id);
    if (!documento || !documento.texto_completo) {
      throw new Error(`Documento ${lockedJob.documento_id} nao tem texto_completo para reextrair itens`);
    }

    logger.info('Processando job de estruturacao de itens', { jobId: lockedJob.id, documentoId: lockedJob.documento_id });
    if (lockedJob.contrato_versao !== CONTRACT_VERSION || lockedJob.texto_hash !== computeInputHash(documento, listarAtasDoDocumento(documento.id))) {
      throw new Error('Itens: job desatualizado; selecionar somente a fonte atual');
    }
    const resultado = await estruturarItensProcesso(documento, { progress, force: Boolean(lockedJob.force) });
    finishItensEstruturacaoJobOk(lockedJob.id, resultado.id);
    logger.info('Job de estruturacao de itens concluido', { jobId: lockedJob.id, documentoId: lockedJob.documento_id });
  } catch (error) {
    if (error.code === 'PIPELINE_YIELD') { throw error; }
    finishItensEstruturacaoJobError(lockedJob.id, error.message);
    logger.error('Job de estruturacao de itens falhou', {
      jobId: lockedJob.id,
      documentoId: lockedJob.documento_id,
      erro: error.message,
    });
    if (progress) { throw error; }
  }
}

async function runPendingItensEstruturacaoJobs() {
  if (workerRunning) {
    return;
  }

  workerRunning = true;
  try {
    const recovered = recoverStaleItensEstruturacaoJobs();
    if (recovered.recovered) {
      logger.info('Jobs de estruturacao de itens presos foram recuperados', recovered);
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const job = getNextPendingItensEstruturacaoJob();
      if (!job) { break; }
      await processJob(job);
    }
  } finally {
    workerRunning = false;
  }
}

function scheduleItensProcessoJobWorker() {
  const pipeline = require('../pipeline/coordinator');
  if (pipeline.enabled()) { pipeline.enqueueLegacy('items'); return; }
  setTimeout(() => {
    runPendingItensEstruturacaoJobs().catch((error) => {
      logger.error('Worker de estruturacao de itens falhou', { erro: error.message });
    });
  }, 0);
}

module.exports = { processJob, runPendingItensEstruturacaoJobs, scheduleItensProcessoJobWorker };
