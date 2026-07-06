const config = require('../config');
const logger = require('../logger');
const { summarizePendingDocuments } = require('./summarize-pending-documents');
const { extractEntitiesFromResumes } = require('./extract-entities');
const { generateAlerts } = require('../alertas/alert-generator');
const { enfileirarItensPendentes } = require('./enfileirar-itens-pendentes');
const { runPendingItensEstruturacaoJobs } = require('./itens-processo-job-worker');

let timer = null;
let cycleRunning = false;
let lastRunAt = null;
let lastRunStats = null;

async function runCycle() {
  if (cycleRunning) {
    logger.debug('AI scheduler: ciclo anterior ainda em andamento, ignorando');
    return;
  }

  if (!config.aiSummaryEnabled) {
    logger.debug('AI scheduler: resumo IA desabilitado');
    return;
  }

  cycleRunning = true;
  lastRunAt = new Date().toISOString();

  logger.info('AI scheduler: iniciando ciclo', {
    docs_por_ciclo: config.aiSchedulerDocsPerCycle,
    delay_entre_docs_s: Math.round(config.aiSchedulerDelayBetweenDocsMs / 1000)
  });

  try {
    const resultado = await summarizePendingDocuments({
      limite: config.aiSchedulerDocsPerCycle,
      concorrencia: 1,
      delayBetweenDocsMs: config.aiSchedulerDelayBetweenDocsMs
    });

    lastRunStats = {
      total_selecionados: resultado.total_selecionados,
      total_ok: resultado.total_ok,
      total_erro: resultado.total_erro
    };

    logger.info('AI scheduler: ciclo concluido', lastRunStats);

    // Pós-ciclo: extrair entidades dos resumos novos (idempotente)
    if (resultado.total_ok > 0) {
      try {
        const entidades = extractEntitiesFromResumes();
        logger.info('AI scheduler: entidades extraidas pós-ciclo', {
          com_vencedor: entidades.com_vencedor,
          com_valor_final: entidades.com_valor_final,
        });
      } catch (errEntidades) {
        logger.warn('AI scheduler: falha na extração pós-ciclo', { erro: errEntidades.message });
      }

    }

    // Pós-ciclo: estruturação de itens via IA pra editais novos/atualizados.
    // Seleção idempotente por hash (edital já processado com o mesmo texto é
    // pulado), então rodar todo ciclo é barato; o worker processa um por vez.
    try {
      const fila = await enfileirarItensPendentes({ limite: config.aiSchedulerDocsPerCycle });
      if (fila.enfileirados.length) {
        logger.info('AI scheduler: itens de processo enfileirados pós-ciclo', {
          enfileirados: fila.enfileirados.length,
        });
        await runPendingItensEstruturacaoJobs();
      }
    } catch (errItens) {
      logger.warn('AI scheduler: falha na estruturação de itens pós-ciclo', { erro: errItens.message });
    }

    // Pós-ciclo: gerar alertas de inteligência de forma incremental. Roda mesmo
    // quando o ciclo atual não produziu resumo, porque resumos podem ter sido
    // criados por scripts/admin entre ciclos.
    if (config.alertasEnabled && config.alertasSchedulerEnabled) {
      try {
        const alertasResult = await generateAlerts({ limite: config.alertasLimitePorCiclo });
        logger.info('AI scheduler: alertas gerados pós-ciclo', {
          total_docs: alertasResult.total,
          gerados: alertasResult.gerados,
          atualizados: alertasResult.atualizados,
          erros: alertasResult.erros,
        });
      } catch (errAlertas) {
        logger.warn('AI scheduler: falha na geração de alertas pós-ciclo', { erro: errAlertas.message });
      }
    }
  } catch (error) {
    lastRunStats = { total_selecionados: 0, total_ok: 0, total_erro: 1, erro: error.message };
    logger.error('AI scheduler: ciclo falhou', { erro: error.message });
  } finally {
    cycleRunning = false;
  }
}

function start() {
  if (!config.aiSchedulerEnabled) {
    logger.info('AI scheduler: desabilitado (AI_SCHEDULER_ENABLED=false)');
    return;
  }

  if (timer) { return; }

  const intervalHoras = Math.round(config.aiSchedulerIntervalMs / 3600000);
  const estimativaDias = Math.ceil(430 / (config.aiSchedulerDocsPerCycle * (24 / intervalHoras)));

  logger.info('AI scheduler: iniciado', {
    docs_por_ciclo: config.aiSchedulerDocsPerCycle,
    intervalo_horas: intervalHoras,
    delay_entre_docs_s: Math.round(config.aiSchedulerDelayBetweenDocsMs / 1000),
    estimativa_cobertura_dias: estimativaDias
  });

  // Primeiro ciclo: 3 min após o servidor subir
  setTimeout(() => {
    runCycle().catch((e) => logger.error('AI scheduler: erro no ciclo inicial', { erro: e.message }));
  }, 3 * 60 * 1000);

  timer = setInterval(() => {
    runCycle().catch((e) => logger.error('AI scheduler: erro no ciclo agendado', { erro: e.message }));
  }, config.aiSchedulerIntervalMs);

  timer.unref?.();
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function getStatus() {
  const intervalHoras = Math.round(config.aiSchedulerIntervalMs / 3600000);
  return {
    enabled: config.aiSchedulerEnabled,
    running: timer !== null,
    cycle_running: cycleRunning,
    docs_por_ciclo: config.aiSchedulerDocsPerCycle,
    delay_entre_docs_s: Math.round(config.aiSchedulerDelayBetweenDocsMs / 1000),
    intervalo_horas: intervalHoras,
    ultimo_ciclo: lastRunAt,
    ultimo_resultado: lastRunStats
  };
}

module.exports = { start, stop, getStatus, runCycle };
