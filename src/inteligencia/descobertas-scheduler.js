'use strict';

const config = require('../config');
const logger = require('../logger');
const { extrairFatosInteligencia } = require('./fatos-runner');
const { generateAlerts } = require('../alertas/alert-generator');
const repo = require('../db/alertas-repo');
const {
  reprocessarInvestigacoesPendentes,
  getInvestigacaoStatus,
} = require('./discovery-investigation-runner');

let timer = null;
let investigationTimer = null;
let running = false;
let investigationRunning = false;
let lastRunAt = null;
let lastRunDay = null;
let lastRunStats = null;
let lastInvestigationRunAt = null;
let lastInvestigationStats = null;

function localDayHour(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    day: `${value.year}-${value.month}-${value.day}`,
    hour: Number(value.hour),
  };
}

async function runCycle({ force = false } = {}) {
  if (running) {
    return { skipped: true, reason: 'running' };
  }

  const atual = localDayHour();
  if (!force && lastRunDay === atual.day) {
    return { skipped: true, reason: 'already_ran_today' };
  }
  if (!force && atual.hour < config.descobertasSchedulerHour) {
    return { skipped: true, reason: 'before_scheduled_hour' };
  }

  running = true;
  lastRunAt = new Date().toISOString();
  logger.info('Descobertas scheduler: iniciando ciclo factual', {
    limite: config.descobertasFatosLimitePorCiclo,
    hora_local: atual.hour,
  });

  try {
    const fatos = extrairFatosInteligencia({
      limite: config.descobertasFatosLimitePorCiclo,
      apply: true,
    });
    const alertas = await generateAlerts({
      full: true,
      limite: Math.max(config.alertasLimitePorCiclo, config.descobertasFatosLimitePorCiclo),
    });
    lastRunDay = atual.day;
    lastRunStats = {
      fatos: {
        documentos: fatos.documentos,
        fatos_salvos: fatos.fatos_salvos,
        anexos: fatos.anexos,
        resumos_anexos: fatos.resumos_anexos,
      },
      alertas: {
        total: alertas.total,
        gerados: alertas.gerados,
        atualizados: alertas.atualizados,
        removidos: alertas.removidos || 0,
        erros: alertas.erros,
      },
    };
    logger.info('Descobertas scheduler: ciclo concluído', lastRunStats);
    return { skipped: false, ...lastRunStats };
  } catch (err) {
    lastRunStats = { erro: err.message };
    logger.error('Descobertas scheduler: ciclo falhou', { erro: err.message });
    throw err;
  } finally {
    running = false;
  }
}

async function runInvestigationCycle({ force = false } = {}) {
  if (investigationRunning) {
    return { skipped: true, reason: 'running' };
  }
  const enabledByDb = repo.getConfig('descobertas:investigacao_scheduler_ativo', true) !== false;
  if (!force && (!config.descobertasInvestigacaoSchedulerEnabled || !enabledByDb)) {
    return { skipped: true, reason: 'disabled' };
  }

  investigationRunning = true;
  lastInvestigationRunAt = new Date().toISOString();
  try {
    const result = await reprocessarInvestigacoesPendentes({ force });
    lastInvestigationStats = result;
    return result;
  } catch (err) {
    lastInvestigationStats = { erro: err.message };
    logger.error('Descobertas scheduler: ciclo incremental IA falhou', { erro: err.message });
    throw err;
  } finally {
    investigationRunning = false;
  }
}

function start() {
  if (!config.descobertasSchedulerEnabled) {
    logger.info('Descobertas scheduler: desabilitado');
    return;
  }
  if (timer) {
    return;
  }
  logger.info('Descobertas scheduler: iniciado', {
    hora_local: config.descobertasSchedulerHour,
    check_min: Math.round(config.descobertasSchedulerCheckMs / 60000),
    investigacao_intervalo_min: Math.round(config.descobertasInvestigacaoIntervalMs / 60000),
    investigacao_por_ciclo: repo.getConfig('descobertas:investigacao_por_ciclo', config.descobertasInvestigacaoPorCiclo),
  });
  setTimeout(() => runCycle().catch(() => {}), 90_000);
  timer = setInterval(() => runCycle().catch(() => {}), config.descobertasSchedulerCheckMs);
  timer.unref?.();

  if (config.descobertasInvestigacaoSchedulerEnabled) {
    setTimeout(() => runInvestigationCycle().catch(() => {}), 4 * 60 * 1000);
    investigationTimer = setInterval(
      () => runInvestigationCycle().catch(() => {}),
      config.descobertasInvestigacaoIntervalMs
    );
    investigationTimer.unref?.();
  }
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (investigationTimer) {
    clearInterval(investigationTimer);
    investigationTimer = null;
  }
}

function getStatus() {
  return {
    enabled: config.descobertasSchedulerEnabled,
    running,
    hora_local: config.descobertasSchedulerHour,
    ultimo_ciclo: lastRunAt,
    ultimo_dia: lastRunDay,
    ultimo_resultado: lastRunStats,
    investigacao: {
      ...getInvestigacaoStatus(),
      running: investigationRunning,
      timer_running: investigationTimer !== null,
      ultimo_ciclo_memoria: lastInvestigationRunAt,
      ultimo_resultado_memoria: lastInvestigationStats,
    },
  };
}

module.exports = {
  start,
  stop,
  runCycle,
  runInvestigationCycle,
  getStatus,
  localDayHour,
};
