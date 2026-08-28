'use strict';

const config = require('../config');
const logger = require('../logger');
const repo = require('../db/alertas-repo');
const { processarDescobertaParaPublicacao } = require('../ai/discovery-investigation');

const WATERMARK_KEY = 'descobertas:investigacao_ultimo_ciclo';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reprocessarInvestigacoesPendentes({
  limite = repo.getConfig('descobertas:investigacao_por_ciclo', config.descobertasInvestigacaoPorCiclo),
  delayMs = repo.getConfig('descobertas:investigacao_delay_ms', config.descobertasInvestigacaoDelayMs),
  force = false,
  id = null,
  dryRun = false,
} = {}) {
  const selecionados = id
    ? [repo.getAlerta(Number(id))].filter((alerta) =>
      alerta?.metadados?.discovery_kind === 'investigacao_factual')
    : repo.listarInvestigacoesPendentes({ limite, incluirRevisao: force });
  const resultado = {
    total_selecionados: selecionados.length,
    total_publicado: 0,
    total_revisao_admin: 0,
    total_candidato: 0,
    total_erro: 0,
    dry_run: Boolean(dryRun),
    itens: [],
  };

  logger.info('Descobertas IA: iniciando reprocessamento incremental', {
    limite,
    selecionados: selecionados.length,
    delay_ms: delayMs,
    force,
    dry_run: dryRun,
  });

  for (const alerta of selecionados) {
    try {
      const investigado = await processarDescobertaParaPublicacao(alerta, {
        force,
        cfg: {
          confiancaMinPublica: repo.getConfig('alertas:investigacao_confianca_min_publica', 0.55),
          // Default false: exige aprovação humana antes de publicar (ver alert-generator.js).
          publicacaoAutomatica: repo.getConfig('alertas:investigacao_publicacao_automatica', false),
        },
      });
      if (!dryRun) {
        repo.upsertAlerta(investigado, investigado.documentos || [], investigado.evidencias || []);
      }
      const status = investigado.estado_editorial || 'candidato';
      if (status === 'publicado') {
        resultado.total_publicado += 1;
      } else if (status === 'revisao') {
        resultado.total_revisao_admin += 1;
      } else {
        resultado.total_candidato += 1;
      }
      resultado.itens.push({
        id: alerta.id,
        chave_unica: alerta.chave_unica,
        tipo: alerta.metadados?.investigacao_tipo || null,
        status,
        motivos: investigado.qualidade_motivos || [],
        provider: investigado.metadados?.discovery_v3?.geracao?.provider || null,
        ...(dryRun ? {
          diagnostico: investigado.metadados?.discovery_v3?.qualidade?.diagnostico_editorial || null,
          editorial_preview: investigado.metadados?.discovery_v3?.editorial || null,
        } : {}),
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

  if (!dryRun) {
    repo.setWatermark(WATERMARK_KEY, {
      ultimoProcessadoEm: new Date().toISOString(),
      totalGerados: resultado.total_publicado,
    });
  }

  logger.info('Descobertas IA: reprocessamento concluido', {
    selecionados: resultado.total_selecionados,
    publicados: resultado.total_publicado,
    revisao_admin: resultado.total_revisao_admin,
    candidatos: resultado.total_candidato,
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
