'use strict';

/**
 * Saúde do pipeline de IA para GET /api/saude/pipeline (público, só números e
 * categoria do erro — nunca o texto cru, que pode trazer detalhes do provider).
 */

const config = require('../config');
const repo = require('../db/pipeline-saude-repo');
const aiScheduler = require('../ai/ai-daily-scheduler');
const { avaliarSaudePipeline } = require('../ai/pipeline-saude');
const { classifyAiError } = require('../ai/operation-policy');

const JANELA_RECENTES_DIAS = 30;
const DIA_MS = 24 * 60 * 60 * 1000;

function dataIso(date) {
  return date.toISOString().slice(0, 10);
}

function getSaudePipeline({ agora = new Date() } = {}) {
  const desde = dataIso(new Date(agora.getTime() - JANELA_RECENTES_DIAS * DIA_MS));
  const ultimoOk = repo.getUltimoResumoOk();
  const ultimoErro = repo.getUltimoErroResumo();
  const recentes = repo.contarRecentesSemResumo({ desde });
  const scheduler = aiScheduler.getStatus();

  const avaliacao = avaliarSaudePipeline({
    agora,
    schedulerHabilitado: Boolean(scheduler.enabled),
    ultimoResumoOkEm: ultimoOk?.em || null,
    recentes,
  });

  return {
    ...avaliacao,
    gerado_em: agora.toISOString(),
    ia: {
      provider: config.aiProvider,
      resumo_habilitado: config.aiSummaryEnabled,
      ultimo_resumo_ok: ultimoOk,
      ultimo_erro: ultimoErro ? { em: ultimoErro.em, categoria: classifyAiError(ultimoErro.erro) } : null,
      scheduler: {
        habilitado: Boolean(scheduler.enabled),
        ultimo_ciclo: scheduler.ultimo_ciclo || null,
        ultimo_resultado: scheduler.ultimo_resultado || null,
      },
    },
    documentos_recentes: {
      janela_dias: JANELA_RECENTES_DIAS,
      desde,
      total_com_texto: recentes.total,
      sem_resumo: recentes.semResumo,
      sem_texto: recentes.semTexto,
      mais_antigo_sem_resumo: recentes.maisAntigoSemResumo,
    },
  };
}

module.exports = { getSaudePipeline };
