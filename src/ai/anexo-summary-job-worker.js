'use strict';

// Worker do job assíncrono de resumo de anexo — mesmo padrão de
// summary-job-worker.js (documento), processando um job por vez para não
// disparar chamadas de IA concorrentes contra o limite de RPM da NVIDIA.

const logger = require('../logger');
const {
  getNextPendingAnexoResumoJob,
  markAnexoResumoJobProcessing,
  finishAnexoResumoJobOk,
  finishAnexoResumoJobError,
  recoverStaleAnexoResumoJobs,
} = require('../db/anexo-resumo-jobs-repo');
const { getAnexoById } = require('../db/inteligencia-fatos-repo');
const { summarizeAnexo } = require('./summarize-anexo');

let workerRunning = false;

async function processJob(job) {
  const lockedJob = markAnexoResumoJobProcessing(job.id);
  if (!lockedJob || lockedJob.status !== 'processando') {
    return;
  }

  try {
    const anexo = getAnexoById(lockedJob.anexo_id);
    if (!anexo || !anexo.texto_completo) {
      throw new Error(`Anexo ${lockedJob.anexo_id} nao tem texto_completo para resumir`);
    }

    logger.info('Processando job de resumo de anexo', { jobId: lockedJob.id, anexoId: lockedJob.anexo_id });
    const resultado = await summarizeAnexo(anexo, { documento: anexo.documento_pai });
    finishAnexoResumoJobOk(lockedJob.id, resultado.id);
    logger.info('Job de resumo de anexo concluido', {
      jobId: lockedJob.id,
      anexoId: lockedJob.anexo_id,
      contrato_versao: resultado.contrato_versao,
    });
  } catch (error) {
    finishAnexoResumoJobError(lockedJob.id, error.message);
    logger.error('Job de resumo de anexo falhou', { jobId: lockedJob.id, anexoId: lockedJob.anexo_id, erro: error.message });
  }
}

async function runPendingAnexoResumoJobs() {
  if (workerRunning) {
    return;
  }

  workerRunning = true;
  try {
    const recovered = recoverStaleAnexoResumoJobs();
    if (recovered.recovered) {
      logger.info('Jobs de resumo de anexo presos foram recuperados', recovered);
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const job = getNextPendingAnexoResumoJob();
      if (!job) { break; }
      await processJob(job);
    }
  } finally {
    workerRunning = false;
  }
}

function scheduleAnexoResumoJobWorker() {
  setTimeout(() => {
    runPendingAnexoResumoJobs().catch((error) => {
      logger.error('Worker de resumo de anexo falhou', { erro: error.message });
    });
  }, 0);
}

module.exports = { runPendingAnexoResumoJobs, scheduleAnexoResumoJobWorker };
