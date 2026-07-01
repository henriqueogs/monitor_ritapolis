'use strict';

// Orquestrador do gerador de alertas. Lê resumos IA novos desde o watermark,
// enriquece cada documento com categoria/grupo/valor, roda os detectores,
// consolida sinais em alertas candidatos, gera narrativa IA para alertas
// temáticos e persiste via alertas-repo.
//
// Sempre respeita as regras de produto (CLAUDE.md):
//  - 11.1: valores escopados por período (valor_periodo_label)
//  - 11.2: ordenação por data_publicacao
//  - 11.3: rastreabilidade — documentos vinculados com url_origem

const { db } = require('../db/connection');
const logger = require('../logger');
const config = require('../config');
const { getLatestResumoAiByDocumentoId } = require('../db/ai-jobs-repo');
const { getCategoriasDocumentoId } = require('../db');
const { getLicitacaoGrupoByDocumentoId } = require('../db');
const { classificarCategoria } = require('../licitacoes/categoria');
const { gerarNarrativaAlerta } = require('../ai/alert-narrative');
const { investigarDescoberta, deveInvestigarDescoberta } = require('../ai/discovery-investigation');
const {
  detectarRepeticaoTematica,
} = require('./detectores/repeticao-tematica');
const { detectarRiscoAlto } = require('./detectores/risco-alto');
const { detectarValorRelevante } = require('./detectores/valor-relevante');
const { detectarAnomaliaTemporal } = require('./detectores/anomalia-temporal');
const { detectarQuestionamentos } = require('./detectores/questionamentos');
const { gerarCandidatosInvestigativos, DEFAULT_TEMAS } = require('./discovery-candidates');
const { consolidarSinais } = require('./consolidador');
const repo = require('../db/alertas-repo');
const { listarFatosParaAlertas } = require('../db/inteligencia-fatos-repo');

const WATERMARK_KEY = 'alertas:ultimo_ciclo';

function getAlertasStatus() {
  const watermark = repo.getWatermark(WATERMARK_KEY);
  const latestResumo = db
    .prepare(
      `SELECT MAX(COALESCE(atualizado_em, criado_em)) AS ultimo_resumo_ai
         FROM documentos_resumos_ai
        WHERE status = 'ok' AND provider <> 'mock'`
    )
    .get();
  const ativos = db.prepare("SELECT COUNT(*) AS n FROM alertas WHERE status = 'ativo'").get().n;
  const ultimoCiclo = watermark?.ultimo_processado_em || null;
  const ultimoResumoAi = latestResumo?.ultimo_resumo_ai || null;
  const pendente = Boolean(
    ultimoResumoAi && (!ultimoCiclo || new Date(ultimoResumoAi).getTime() > new Date(ultimoCiclo).getTime())
  );
  const atrasoMs = pendente ? Date.now() - new Date(ultimoResumoAi).getTime() : 0;

  return {
    enabled: config.alertasEnabled,
    scheduler_enabled: config.alertasSchedulerEnabled,
    ativos,
    ultimo_ciclo: ultimoCiclo,
    ultimo_resumo_ai: ultimoResumoAi,
    pendente,
    atraso_minutos: Math.max(0, Math.round(atrasoMs / 60000)),
    limite_por_ciclo: config.alertasLimitePorCiclo,
  };
}

function parseResumoJson(registro) {
  if (!registro || !registro.resumo_json) {
    return null;
  }
  const json = typeof registro.resumo_json === 'string'
    ? safeParse(registro.resumo_json)
    : registro.resumo_json;
  return json;
}

function safeParse(texto) {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

// Busca documentos com resumo IA novo/atualizado desde `since`.
// Ordena por data_publicacao DESC (regra 11.2).
function buscarDocumentosRecentes(since, limite) {
  const params = { limite };
  const where = since ? 'WHERE ra.criado_em > @since OR d.atualizado_em > @since' : '';
  if (since) {
    params.since = since;
  }
  const rows = db
    .prepare(
      `SELECT DISTINCT d.id, d.titulo, d.tipo, d.ano, d.fonte, d.data_publicacao,
              d.url_origem, d.valor_estimado, d.texto_completo
         FROM documentos d
         JOIN documentos_resumos_ai ra ON ra.documento_id = d.id
        ${where}
        ORDER BY COALESCE(d.data_publicacao, '') DESC, d.id DESC
        LIMIT @limite`
    )
    .all(params);
  return rows;
}

function buscarValorDocumento(documentoId) {
  const det = db
    .prepare('SELECT valor_final FROM licitacoes_detalhes WHERE documento_id = ?')
    .get(documentoId);
  if (det && Number(det.valor_final) > 0) {
    return Number(det.valor_final);
  }
  return null;
}

// Monta o "documento enriquecido" esperado pelos detectores.
function enriquecerDocumento(row) {
  const resumoRegistro = getLatestResumoAiByDocumentoId(row.id);
  const resumo = parseResumoJson(resumoRegistro);

  let categoria = null;
  const catRow = getCategoriasDocumentoId(row.id);
  if (catRow && catRow.categoria) {
    categoria = catRow.categoria;
  } else {
    const classificada = classificarCategoria({
      titulo: row.titulo || '',
      objeto: resumo?.objeto?.descricao || '',
      produtos: [],
    });
    if (classificada && classificada.categoria && classificada.categoria !== 'Outros') {
      categoria = classificada.categoria;
    }
  }

  let grupoId = null;
  if (row.tipo === 'edital') {
    const grupo = getLicitacaoGrupoByDocumentoId(row.id);
    if (grupo && grupo.grupo_id) {
      grupoId = grupo.grupo_id;
    }
  }

  const valor = buscarValorDocumento(row.id) ?? (Number(row.valor_estimado) > 0 ? Number(row.valor_estimado) : 0);

  return {
    id: row.id,
    titulo: row.titulo,
    tipo: row.tipo,
    categoria,
    ano: row.ano ?? null,
    data_publicacao: row.data_publicacao || null,
    valor,
    grupo_id: grupoId,
    url_origem: row.url_origem || null,
    resumo: resumo
      ? {
        alertas: resumo.alertas || [],
        lacunas: resumo.lacunas || [],
        consistencia: resumo.consistencia || [],
        confianca: typeof resumo.confianca === 'number' ? resumo.confianca : null,
      }
      : null,
  };
}

function lerConfig() {
  const gatilhosDefault = {
    repeticao_tematica: true,
    risco_alto: true,
    valor_relevante: true,
    anomalia_temporal: true,
    questionamentos: true,
    fatos_agregados: true,
  };
  return {
    minRepeticao: repo.getConfig('alertas:min_repeticao', config.alertasMinRepeticao ?? 2),
    valorThreshold: repo.getConfig('alertas:valor_threshold', config.alertasValorThreshold ?? 500000),
    anomaliaMultiplicador: repo.getConfig('alertas:anomalia_multiplicador', 3),
    anomaliaMinAbsoluto: repo.getConfig('alertas:anomalia_min_absoluto', 3),
    gatilhosAtivos: { ...gatilhosDefault, ...repo.getConfig('alertas:gatilhos_ativos', {}) },
    fatosThresholdArvores: repo.getConfig('alertas:fatos_threshold_arvores', 60),
    fatosMinDocsRecorrencia: repo.getConfig('alertas:fatos_min_docs_recorrencia', 3),
    investigacaoIaAtiva: repo.getConfig('alertas:investigacao_ia_ativa', true),
    investigacaoMinArvores: repo.getConfig('alertas:investigacao_min_arvores', 20),
    investigacaoMaxPorCiclo: repo.getConfig('alertas:investigacao_max_por_ciclo', 20),
    investigacaoTemasAtivos: repo.getConfig('alertas:investigacao_temas_ativos', DEFAULT_TEMAS),
    investigacaoConfiancaMinPublica: repo.getConfig('alertas:investigacao_confianca_min_publica', 0.55),
    investigacaoPublicacaoAutomatica: repo.getConfig('alertas:investigacao_publicacao_automatica', true),
  };
}

async function aplicarInvestigacaoDescobertas(candidatos, cfg) {
  const out = [];
  let investigadas = 0;
  const max = Math.max(Number(cfg.investigacaoMaxPorCiclo) || 0, 0);

  for (const candidato of candidatos) {
    if (!deveInvestigarDescoberta(candidato)) {
      out.push(candidato);
      continue;
    }

    if (investigadas >= max || cfg.investigacaoIaAtiva === false) {
      out.push({
        ...candidato,
        metadados: {
          ...(candidato.metadados || {}),
          discovery_v2: {
            contrato_versao: 'discovery-investigation-v2',
            status: cfg.investigacaoIaAtiva === false ? 'desativado' : 'limite_ciclo',
            gerado_em: new Date().toISOString(),
          },
        },
      });
      continue;
    }

    out.push(await investigarDescoberta(candidato, {
      cfg: {
        confiancaMinPublica: cfg.investigacaoConfiancaMinPublica,
        publicacaoAutomatica: cfg.investigacaoPublicacaoAutomatica,
      },
    }));
    investigadas += 1;
  }

  return out;
}

// Gera alertas a partir dos resumos IA novos. Idempotente via watermark.
// `full`: rebuild completo (varre todo o acervo, ignora watermark e reconcilia o
// feed removendo descobertas ativas que caíram abaixo dos thresholds atuais).
// Usado pelo painel admin após ajustar thresholds; o ciclo diário fica incremental.
// Retorna { total, gerados, atualizados, erros, removidos, alertas }.
async function generateAlerts({ since, limite = 200, dryRun = false, full = false } = {}) {
  const cfg = lerConfig();
  const watermark = repo.getWatermark(WATERMARK_KEY);
  const sinceDate = full ? null : since || (watermark ? watermark.ultimo_processado_em : null);

  logger.info('Gerador de alertas: iniciando ciclo', {
    since: sinceDate,
    limite,
    dryRun,
    full,
  });

  const rows = buscarDocumentosRecentes(sinceDate, limite);
  if (!rows.length && !cfg.gatilhosAtivos.fatos_agregados) {
    logger.info('Gerador de alertas: nenhum documento novo');
    return { total: 0, gerados: 0, atualizados: 0, erros: 0, alertas: [] };
  }
  if (!rows.length) {
    logger.info('Gerador de alertas: nenhum resumo novo; avaliando camada factual');
  }

  const docs = rows.map(enriquecerDocumento).filter((d) => d.resumo !== null);
  const docsById = new Map(docs.map((d) => [d.id, d]));

  const sinais = [];
  if (cfg.gatilhosAtivos.repeticao_tematica) {
    sinais.push(...detectarRepeticaoTematica(docs, { minRepeticao: cfg.minRepeticao }));
  }
  if (cfg.gatilhosAtivos.risco_alto) {
    sinais.push(...detectarRiscoAlto(docs));
  }
  if (cfg.gatilhosAtivos.valor_relevante) {
    sinais.push(...detectarValorRelevante(docs, { valorThreshold: cfg.valorThreshold }));
  }
  if (cfg.gatilhosAtivos.anomalia_temporal) {
    sinais.push(...detectarAnomaliaTemporal(docs, {
      multiplicador: cfg.anomaliaMultiplicador,
      minAbsoluto: cfg.anomaliaMinAbsoluto,
    }));
  }
  if (cfg.gatilhosAtivos.questionamentos) {
    sinais.push(...detectarQuestionamentos(docs));
  }

  const candidatos = consolidarSinais(sinais, docsById);
  if (cfg.gatilhosAtivos.fatos_agregados) {
    const fatos = listarFatosParaAlertas({ limite: full ? 20000 : 5000 });
    candidatos.push(...gerarCandidatosInvestigativos(fatos, {
      thresholdArvores: cfg.investigacaoMinArvores || cfg.fatosThresholdArvores,
      temasAtivos: cfg.investigacaoTemasAtivos,
    }));
  }
  const candidatosInvestigados = await aplicarInvestigacaoDescobertas(candidatos, cfg);
  logger.info('Gerador de alertas: candidatos consolidados', {
    documentos: docs.length,
    sinais: sinais.length,
    candidatos: candidatosInvestigados.length,
  });

  if (dryRun) {
    return {
      total: docs.length,
      gerados: candidatosInvestigados.length,
      atualizados: 0,
      erros: 0,
      alertas: candidatosInvestigados,
      dryRun: true,
    };
  }

  let gerados = 0;
  let atualizados = 0;
  let erros = 0;
  const alertasSalvos = [];

  for (const candidato of candidatosInvestigados) {
    try {
      const alertaParaSalvar = { ...candidato };
      if (candidato.tipo === 'tematico' && !candidato.metadados?.tipo_fato) {
        const docsParaNarrativa = candidato.documentos_ids
          .map((id) => docsById.get(id))
          .filter(Boolean)
          .map((d) => ({
            id: d.id,
            titulo: d.titulo,
            data_publicacao: d.data_publicacao,
            url_origem: d.url_origem,
            valor: d.valor,
          }));
        try {
          const narrativa = await gerarNarrativaAlerta({
            ...candidato,
            documentos: docsParaNarrativa,
          });
          alertaParaSalvar.titulo = narrativa.titulo;
          alertaParaSalvar.narrativa = narrativa.narrativa;
          if (narrativa.questionamentos.length) {
            alertaParaSalvar.questionamentos = [
              ...new Set([...(candidato.questionamentos || []), ...narrativa.questionamentos]),
            ].slice(0, 10);
          }
        } catch (err) {
          logger.warn('Gerador de alertas: falha na narrativa IA, usando template', {
            alerta: candidato.chave_unica,
            erro: err.message,
          });
          alertaParaSalvar.narrativa = montarNarrativaTemplate(candidato, docsById);
        }
      } else if (!alertaParaSalvar.narrativa) {
        alertaParaSalvar.narrativa = montarNarrativaTemplate(candidato, docsById);
      }

      const result = repo.upsertAlerta(alertaParaSalvar, candidato.documentos, candidato.evidencias || []);
      if (result.action === 'inserted') {
        gerados += 1;
      } else {
        atualizados += 1;
      }
      alertasSalvos.push({ id: result.id, ...alertaParaSalvar });
    } catch (err) {
      erros += 1;
      logger.error('Gerador de alertas: erro ao persistir alerta', {
        chave: candidato.chave_unica,
        erro: err.message,
      });
    }
  }

  // Rebuild completo: reconcilia o feed retirando ativos que não foram regerados
  // (caíram abaixo dos thresholds). Decisões humanas (arquivado/suprimido) ficam.
  let removidos = 0;
  if (full) {
    removidos = repo.removerAtivosNaoListados(candidatosInvestigados.map((c) => c.chave_unica));
  }

  const agora = new Date().toISOString();
  repo.setWatermark(WATERMARK_KEY, { ultimoProcessadoEm: agora, totalGerados: gerados });

  logger.info('Gerador de alertas: ciclo concluído', {
    total: docs.length,
    gerados,
    atualizados,
    erros,
    removidos,
  });

  return {
    total: docs.length,
    gerados,
    atualizados,
    erros,
    removidos,
    alertas: alertasSalvos,
  };
}

function montarNarrativaTemplate(candidato, docsById) {
  const docs = candidato.documentos_ids.map((id) => docsById.get(id)).filter(Boolean);
  const partes = [];
  if (candidato.tipo === 'tematico') {
    partes.push(`${candidato.categoria}: ${docs.length} processo(s) em ${candidato.metadados?.count ? '' : ''}${docs[0]?.ano ?? 's/ ano'}.`);
    if (candidato.valor_total) {
      partes.push(`Total estimado: R$ ${candidato.valor_total.toFixed(2)} (${candidato.valor_periodo_label}).`);
    }
    if (candidato.metadados?.motivos?.length) {
      partes.push(candidato.metadados.motivos.join('; '));
    }
  } else {
    partes.push(`Risco alto detectado no documento ${candidato.documentos_ids[0]}.`);
    if (candidato.metadados?.motivo) {
      partes.push(candidato.metadados.motivo);
    }
  }
  if (candidato.questionamentos?.length) {
    partes.push(`Questionamentos: ${candidato.questionamentos.join('; ')}`);
  }
  return partes.join(' ');
}

module.exports = { generateAlerts, enriquecerDocumento, getAlertasStatus, WATERMARK_KEY };
