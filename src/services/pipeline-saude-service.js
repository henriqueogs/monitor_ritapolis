'use strict';

/**
 * Saúde do pipeline de IA para GET /api/saude/pipeline (público, só números e
 * categoria do erro — nunca o texto cru, que pode trazer detalhes do provider).
 */

const config = require('../config');
const repo = require('../db/pipeline-saude-repo');
const aiScheduler = require('../ai/ai-daily-scheduler');
const { avaliarSaudePipeline, avaliarCampanhaHistorica } = require('../ai/pipeline-saude');
const { classifyAiError } = require('../ai/operation-policy');

// Failures that need a human or a dedicated path (oversized file, source
// changed/unreadable) are not provider or code faults.
const CATEGORIAS_REVISAO = new Set(['limite_tamanho', 'revisao_fonte']);

const LIMITE_HISTORICO_PADRAO = 10; // docs/dia; acima disso há força-tarefa ligada
const JANELA_RECENTES_DIAS = 30;
const DIA_MS = 24 * 60 * 60 * 1000;

function dataIso(date) {
  return date.toISOString().slice(0, 10);
}

function montarCampanha(agora) {
  const limite = config.pipelineHistoricalDocsPerDay;
  if (!(limite > LIMITE_HISTORICO_PADRAO)) { return null; }
  const dados = repo.getCampanhaHistorica({ desde: new Date(agora.getTime() - DIA_MS).toISOString() });
  const errosLimiteProvider = dados.errosRecentes.filter(
    (e) => classifyAiError(e) === 'limite_provider'
  ).length;
  return {
    motivos: avaliarCampanhaHistorica({
      agora,
      ativa: true,
      pendentes: dados.pendentes,
      ultimaExecucaoEm: dados.ultimaExecucaoEm,
      errosLimiteProvider,
    }),
    resumo: {
      ativa: true,
      limite_docs_dia: limite,
      orcamento_min: Math.round(config.pipelineHistoricalBudgetMs / 60000),
      docs_24h: dados.docsUltimas24h,
      pendentes: dados.pendentes,
      sem_resumo_com_texto: dados.semResumoComTexto,
      ultima_execucao: dados.ultimaExecucaoEm,
      erros_limite_provider_24h: errosLimiteProvider,
    },
  };
}

function getSaudePipeline({ agora = new Date() } = {}) {
  const desde = dataIso(new Date(agora.getTime() - JANELA_RECENTES_DIAS * DIA_MS));
  const ultimoOk = repo.getUltimoResumoOk();
  const ultimoErro = repo.getUltimoErroResumo();
  const recentes = repo.contarRecentesSemResumo({ desde });
  const scheduler = aiScheduler.getStatus();
  const pipeline = require('../pipeline/coordinator');
  if (pipeline.enabled()) {
    scheduler.enabled = true;
  }
  const state = pipeline.enabled() ? pipeline.status() : null;

  const avaliacao = avaliarSaudePipeline({
    agora,
    schedulerHabilitado: Boolean(scheduler.enabled),
    ultimoResumoOkEm: ultimoOk?.em || null,
    recentes,
  });
  if (state?.safety.paused) {
    avaliacao.motivos.push(`escritas_pausadas:${state.safety.reason}`);
  }
  const revisao = state?.failures.filter(f => CATEGORIAS_REVISAO.has(classifyAiError(f.error))) || [];
  const falhasReais = (state?.failures.length || 0) - revisao.length;
  if (falhasReais > 0) {
    avaliacao.motivos.push('tarefas_atuais_com_falha');
  }
  const campanha = montarCampanha(agora);
  if (campanha) {
    avaliacao.motivos.push(...campanha.motivos);
  }
  const avisos = revisao.length ? ['documentos_aguardando_revisao'] : [];
  if (
    state?.oldest_pending_recent &&
    agora.getTime() - Date.parse(state.oldest_pending_recent) > DIA_MS
  ) {
    avaliacao.motivos.push('fila_pendente_24h');
  }
  avaliacao.status = avaliacao.motivos.length ? 'alerta' : 'ok';

  return {
    ...avaliacao,
    avisos,
    ...(campanha ? { campanha: campanha.resumo } : {}),
    ...(pipeline.enabled()
      ? {
          pipeline: (() => {
            return {
              active: state.active,
              counts: state.counts,
              oldest_pending: state.oldest_pending,
              oldest_pending_recent: state.oldest_pending_recent,
              waiting: state.waiting,
              falhas_reais: falhasReais,
              aguardando_revisao: revisao.length,
              safety: { paused: state.safety.paused, reason: state.safety.reason },
              failures: state.failures.map(f => ({
                id: f.id,
                kind: f.kind,
                categoria: classifyAiError(f.error),
              })),
            };
          })(),
        }
      : {}),
    gerado_em: agora.toISOString(),
    ia: {
      provider: config.aiProvider,
      resumo_habilitado: config.aiSummaryEnabled,
      ultimo_resumo_ok: ultimoOk,
      ultimo_erro: ultimoErro
        ? { em: ultimoErro.em, categoria: classifyAiError(ultimoErro.erro) }
        : null,
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
