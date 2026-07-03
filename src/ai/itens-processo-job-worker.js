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
const { estruturarItensProcesso } = require('./estruturar-itens-processo');

let workerRunning = false;

async function processJob(job) {
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
    const resultado = await estruturarItensProcesso(documento);
    finishItensEstruturacaoJobOk(lockedJob.id, resultado.id);
    logger.info('Job de estruturacao de itens concluido', { jobId: lockedJob.id, documentoId: lockedJob.documento_id });
  } catch (error) {
    finishItensEstruturacaoJobError(lockedJob.id, error.message);
    logger.error('Job de estruturacao de itens falhou', {
      jobId: lockedJob.id,
      documentoId: lockedJob.documento_id,
      erro: error.message,
    });
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
  setTimeout(() => {
    runPendingItensEstruturacaoJobs().catch((error) => {
      logger.error('Worker de estruturacao de itens falhou', { erro: error.message });
    });
  }, 0);
}

module.exports = { runPendingItensEstruturacaoJobs, scheduleItensProcessoJobWorker };
