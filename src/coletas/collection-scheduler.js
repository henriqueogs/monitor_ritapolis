const config = require('../config');
const logger = require('../logger');
const { db } = require('../db');
const { startCollectionUpdate, getCollectionUpdateStatus } = require('./update-runner');

let timer = null;

function getLastCollectionAt() {
  const row = db
    .prepare(
      "SELECT MAX(fim) AS last_fim FROM coletas_log WHERE fim IS NOT NULL AND status <> 'erro_total'"
    )
    .get();
  return row?.last_fim ? new Date(row.last_fim) : null;
}

function isCollectionDue() {
  const last = getLastCollectionAt();
  if (!last) {return true;}

  const intervalMs = config.collectionSchedulerIntervalHours * 60 * 60 * 1000;
  return Date.now() - last.getTime() >= intervalMs;
}

function tick() {
  if (!config.collectionSchedulerEnabled) {return;}

  const status = getCollectionUpdateStatus();
  if (status.running) {
    logger.debug('Scheduler de coleta: coleta em andamento, aguardando');
    return;
  }

  if (!isCollectionDue()) {
    logger.debug('Scheduler de coleta: dentro do intervalo, nada a fazer');
    return;
  }

  const last = getLastCollectionAt();
  logger.info('Scheduler de coleta: iniciando coleta automatica', {
    ultima_coleta: last?.toISOString() || 'nunca',
    intervalo_horas: config.collectionSchedulerIntervalHours
  });

  const result = startCollectionUpdate({ fonte: 'todas' });

  if (!result.started) {
    logger.warn('Scheduler de coleta: nao foi possivel iniciar (coleta ja em andamento?)');
  }
}

function start() {
  if (!config.collectionSchedulerEnabled) {
    logger.info('Scheduler de coleta: desabilitado (COLLECTION_SCHEDULER_ENABLED=false)');
    return;
  }

  if (timer) {return;}

  logger.info('Scheduler de coleta: iniciado', {
    intervalo_verificacao_min: Math.round(config.collectionSchedulerCheckMs / 60000),
    intervalo_coleta_horas: config.collectionSchedulerIntervalHours
  });

  // Verifica na inicialização (com delay de 30s para a API subir completamente)
  setTimeout(tick, 30_000);

  // Verifica periodicamente
  timer = setInterval(tick, config.collectionSchedulerCheckMs);
  timer.unref?.(); // não bloqueia o processo de encerrar
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function getStatus() {
  const last = getLastCollectionAt();
  const intervalMs = config.collectionSchedulerIntervalHours * 60 * 60 * 1000;
  const nextDue = last ? new Date(last.getTime() + intervalMs) : null;
  return {
    enabled: config.collectionSchedulerEnabled,
    running: timer !== null,
    intervalo_horas: config.collectionSchedulerIntervalHours,
    ultima_coleta: last?.toISOString() || null,
    proxima_coleta: nextDue?.toISOString() || null,
    proxima_em_minutos: nextDue ? Math.max(0, Math.round((nextDue.getTime() - Date.now()) / 60000)) : null
  };
}

module.exports = { start, stop, getStatus };
