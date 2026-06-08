const logger = require('../logger');
const {
  finishResumoAiJobError,
  finishResumoAiJobOk,
  getNextPendingResumoAiJob,
  getResumoAiByDocumentoHash,
  markResumoAiJobProcessing,
  recoverStaleResumoAiJobs,
  estruturarProdutosDeResumoAi
} = require('../db');
const { summarizeDocument } = require('./summarize-document');

let workerRunning = false;

async function processJob(job) {
  const lockedJob = markResumoAiJobProcessing(job.id);
  if (!lockedJob || lockedJob.status !== 'processando') {
    return;
  }

  try {
    logger.info('Processando job de resumo IA', {
      jobId: lockedJob.id,
      documentoId: lockedJob.documento_id,
      force: lockedJob.force
    });

    const result = await summarizeDocument(lockedJob.documento_id, {
      force: lockedJob.force
    });
    const resumoAi = getResumoAiByDocumentoHash(
      lockedJob.documento_id,
      result.texto_hash,
      result.contrato_versao
    );

    finishResumoAiJobOk(lockedJob.id, resumoAi?.id || null);

    logger.info('Job de resumo IA concluido', {
      jobId: lockedJob.id,
      documentoId: lockedJob.documento_id,
      reutilizado: result.reutilizado
    });

    if (resumoAi) {
      try {
        const prodResult = estruturarProdutosDeResumoAi(lockedJob.documento_id, resumoAi);
        if (prodResult.produtos_salvos > 0) {
          logger.info('Produtos extraidos do resumo IA', { documentoId: lockedJob.documento_id, ...prodResult });
        }
      } catch (err) {
        logger.warn('Erro ao estruturar produtos do resumo IA', { documentoId: lockedJob.documento_id, erro: err.message });
      }
    }
  } catch (error) {
    finishResumoAiJobError(lockedJob.id, error.message);
    logger.error('Job de resumo IA falhou', {
      jobId: lockedJob.id,
      documentoId: lockedJob.documento_id,
      erro: error.message
    });
  }
}

async function runPendingResumoAiJobs() {
  if (workerRunning) {
    return;
  }

  workerRunning = true;
  try {
    const recovered = recoverStaleResumoAiJobs();
    if (recovered.recovered) {
      logger.info('Jobs de resumo IA presos foram recuperados', recovered);
    }

    while (true) {
      const job = getNextPendingResumoAiJob();
      if (!job) break;
      await processJob(job);
    }
  } finally {
    workerRunning = false;
  }
}

function scheduleResumoAiJobWorker() {
  setTimeout(() => {
    runPendingResumoAiJobs().catch((error) => {
      logger.error('Worker de resumo IA falhou', { erro: error.message });
    });
  }, 0);
}

module.exports = {
  runPendingResumoAiJobs,
  scheduleResumoAiJobWorker
};
