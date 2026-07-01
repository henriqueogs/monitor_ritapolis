'use strict';

const config = require('../config');
const logger = require('../logger');
const repo = require('../db/alertas-repo');
const { investigarDescoberta } = require('../ai/discovery-investigation');

const WATERMARK_KEY = 'descobertas:investigacao_ultimo_ciclo';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reprocessarInvestigacoesPendentes({
  limite = repo.getConfig('descobertas:investigacao_por_ciclo', config.descobertasInvestigacaoPorCiclo),
  delayMs = repo.getConfig('descobertas:investigacao_delay_ms', config.descobertasInvestigacaoDelayMs),
  force = false,
} = {}) {
  if (!force && !config.aiSummaryEnabled) {
    return {
      total_selecionados: 0,
      total_ok: 0,
      total_fallback: 0,
      total_erro: 0,
      skipped: true,
      reason: 'AI_SUMMARY_ENABLED=false',
    };
  }

  const pendentes = repo.listarInvestigacoesPendentes({ limite });
  const resultado = {
    total_selecionados: pendentes.length,
    total_ok: 0,
    total_fallback: 0,
    total_revisao_admin: 0,
    total_erro: 0,
    itens: [],
  };

  logger.info('Descobertas IA: iniciando reprocessamento incremental', {
    limite,
    selecionados: pendentes.length,
    delay_ms: delayMs,
  });

  for (const alerta of pendentes) {
    try {
      const investigado = await investigarDescoberta(alerta, {
        cfg: {
          confiancaMinPublica: repo.getConfig('alertas:investigacao_confianca_min_publica', 0.55),
          publicacaoAutomatica: repo.getConfig('alertas:investigacao_publicacao_automatica', true),
        },
      });
      repo.upsertAlerta(investigado, investigado.documentos || [], investigado.evidencias || []);
      const status = investigado.metadados?.discovery_v2?.status || 'sem_status';
      if (status === 'ok') {
        resultado.total_ok += 1;
      } else if (status === 'fallback') {
        resultado.total_fallback += 1;
      } else if (status === 'revisao_admin') {
        resultado.total_revisao_admin += 1;
      }
      resultado.itens.push({
        id: alerta.id,
        chave_unica: alerta.chave_unica,
        tipo: alerta.metadados?.investigacao_tipo || null,
        status,
        provider: investigado.metadados?.discovery_v2?.provider || null,
      });
    } catch (err) {
      resultado.total_erro += 1;
      resultado.itens.push({
        id: alerta.id,
        chave_unica: alerta.chave_unica,
        erro: err.message,
      });
      logger.warn('Descobertas IA: falha ao reprocessar alerta', {
        id: alerta.id,
        chave: alerta.chave_unica,
        erro: err.message,
      });
    }

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  repo.setWatermark(WATERMARK_KEY, {
    ultimoProcessadoEm: new Date().toISOString(),
    totalGerados: resultado.total_ok,
  });

  logger.info('Descobertas IA: reprocessamento concluido', {
    selecionados: resultado.total_selecionados,
    ok: resultado.total_ok,
    fallback: resultado.total_fallback,
    revisao_admin: resultado.total_revisao_admin,
    erros: resultado.total_erro,
  });

  return resultado;
}

function getInvestigacaoStatus() {
  const watermark = repo.getWatermark(WATERMARK_KEY);
  return {
    enabled: config.descobertasInvestigacaoSchedulerEnabled && repo.getConfig('descobertas:investigacao_scheduler_ativo', true) !== false,
    por_ciclo: repo.getConfig('descobertas:investigacao_por_ciclo', config.descobertasInvestigacaoPorCiclo),
    delay_ms: repo.getConfig('descobertas:investigacao_delay_ms', config.descobertasInvestigacaoDelayMs),
    intervalo_ms: config.descobertasInvestigacaoIntervalMs,
    ultimo_ciclo: watermark?.ultimo_processado_em || null,
    total_ok_acumulado: watermark?.total_gerados || 0,
  };
}

module.exports = {
  WATERMARK_KEY,
  reprocessarInvestigacoesPendentes,
  getInvestigacaoStatus,
};
