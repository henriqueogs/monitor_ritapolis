'use strict';

/**
 * Regras de saúde do pipeline de IA (domínio puro, sem I/O).
 *
 * Contexto (24/09/2026): documentos publicados desde ~28/08 ficaram sem
 * "leitura simples" e nada alertou — o único check automático (VM capacity)
 * só olha memória/disco. Estas regras alimentam GET /api/saude/pipeline e o
 * workflow diário que falha (e avisa por e-mail) quando o pipeline para.
 */

const HORA_MS = 60 * 60 * 1000;
const LIMITE_SEM_RESUMO_MS = 24 * HORA_MS;
const FRACAO_MAXIMA_SEM_RESUMO = 0.5;
const LIMITE_SEM_PROGRESSO_MS = 36 * HORA_MS;

const MOTIVOS = {
  SCHEDULER_DESABILITADO: 'scheduler_desabilitado',
  NUNCA_RESUMIU: 'nunca_resumiu',
  SEM_RESUMO_OK_24H: 'sem_resumo_ok_24h',
  MAIORIA_RECENTES_SEM_RESUMO: 'maioria_recentes_sem_resumo',
  CAMPANHA_LIMITE_PROVIDER: 'campanha_limite_provider',
  CAMPANHA_SEM_PROGRESSO: 'campanha_sem_progresso',
};

function idadeMs(agora, iso) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Infinity : agora.getTime() - t;
}

/**
 * @param {object} p
 * @param {Date} p.agora
 * @param {boolean} p.schedulerHabilitado
 * @param {string|null} p.ultimoResumoOkEm - ISO do último resumo com status ok
 * @param {{ total: number, semResumo: number }} p.recentes - docs com texto publicados na janela
 */
function avaliarSaudePipeline({ agora, schedulerHabilitado, ultimoResumoOkEm, recentes }) {
  const motivos = [];
  const pendentes = recentes?.semResumo || 0;
  const total = recentes?.total || 0;

  if (!schedulerHabilitado) {motivos.push(MOTIVOS.SCHEDULER_DESABILITADO);}

  if (!ultimoResumoOkEm && pendentes > 0) {
    motivos.push(MOTIVOS.NUNCA_RESUMIU);
  } else if (pendentes > 0 && idadeMs(agora, ultimoResumoOkEm) > LIMITE_SEM_RESUMO_MS) {
    motivos.push(MOTIVOS.SEM_RESUMO_OK_24H);
  }

  if (total > 0 && pendentes / total > FRACAO_MAXIMA_SEM_RESUMO) {
    motivos.push(MOTIVOS.MAIORIA_RECENTES_SEM_RESUMO);
  }

  return { status: motivos.length ? 'alerta' : 'ok', motivos };
}

/**
 * Força-tarefa de resumos históricos (teto de docs/dia elevado): alerta se o
 * provedor devolveu 429 nas últimas 24h ou se há fila histórica e nada rodou
 * há mais de 36h. Campanha desligada ou sem pendências nunca alerta.
 */
function avaliarCampanhaHistorica({ agora, ativa, pendentes, ultimaExecucaoEm, errosLimiteProvider }) {
  if (!ativa) {return [];}
  const motivos = [];
  if (errosLimiteProvider > 0) {motivos.push(MOTIVOS.CAMPANHA_LIMITE_PROVIDER);}
  if (pendentes > 0 && (!ultimaExecucaoEm || idadeMs(agora, ultimaExecucaoEm) > LIMITE_SEM_PROGRESSO_MS)) {
    motivos.push(MOTIVOS.CAMPANHA_SEM_PROGRESSO);
  }
  return motivos;
}

/** Ciclo de IA está atrasado? (nunca rodou nesta vida do processo = sim) */
function cicloDevido({ agora, ultimoCicloEm, intervaloMs }) {
  if (!ultimoCicloEm) {return true;}
  return idadeMs(agora, ultimoCicloEm) >= intervaloMs;
}

module.exports = { avaliarSaudePipeline, avaliarCampanhaHistorica, cicloDevido, MOTIVOS };
