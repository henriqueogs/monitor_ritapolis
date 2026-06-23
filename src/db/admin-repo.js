'use strict';

/**
 * Repositório admin — Monitor Ritápolis.
 * Queries de observabilidade para o painel /admin:
 * jobs de IA, cobertura, erros recentes, atividade de coleta.
 */

const { db } = require('./index');

// ── Jobs ──────────────────────────────────────────────────────────────────────

function getJobsStatus() {
  const porStatus = db
    .prepare('SELECT status, COUNT(*) n FROM documentos_resumos_ai_jobs GROUP BY status')
    .all()
    .reduce((acc, r) => { acc[r.status] = r.n; return acc; }, {});

  const totalDocs = db.prepare('SELECT COUNT(*) n FROM documentos').get().n;
  const comResumo = db
    .prepare('SELECT COUNT(*) n FROM documentos_resumos_ai WHERE resumo_json IS NOT NULL')
    .get().n;

  return {
    pendente: porStatus.pendente || 0,
    ok: porStatus.ok || 0,
    erro: porStatus.erro || 0,
    processando: porStatus.processando || 0,
    total_docs: totalDocs,
    com_resumo: comResumo,
    pct_resumo: totalDocs > 0 ? Math.round((comResumo / totalDocs) * 100) : 0,
  };
}

function getErrosRecentes(limite = 10) {
  return db
    .prepare(`
      SELECT
        j.documento_id, j.erro, j.tentativas, j.atualizado_em,
        d.titulo, d.tipo, d.ano
      FROM documentos_resumos_ai_jobs j
      JOIN documentos d ON d.id = j.documento_id
      WHERE j.status = 'erro'
      ORDER BY j.atualizado_em DESC
      LIMIT ?
    `)
    .all(limite);
}

// ── Cobertura de vencedores ───────────────────────────────────────────────────

function getCoberturaVencedores() {
  const r = db
    .prepare(`
      SELECT
        COUNT(*)                                      AS total,
        SUM(vencedor_nome IS NOT NULL)                AS com_vencedor,
        SUM(vencedor_cnpj IS NOT NULL)                AS com_cnpj,
        SUM(valor_final IS NOT NULL)                  AS com_valor_final,
        SUM(origem = 'resumo_ai')                     AS origem_ai,
        SUM(origem = 'portal_transparencia')          AS origem_portal,
        SUM(origem = 'pncp')                          AS origem_pncp
      FROM licitacoes_detalhes
    `)
    .get();

  return {
    total: r.total,
    com_vencedor: r.com_vencedor,
    com_cnpj: r.com_cnpj,
    com_valor_final: r.com_valor_final,
    pct_vencedor: r.total > 0 ? Math.round((r.com_vencedor / r.total) * 100) : 0,
    por_origem: {
      resumo_ai: r.origem_ai,
      portal_transparencia: r.origem_portal,
      pncp: r.origem_pncp,
    },
  };
}

// ── Atividade de coleta ───────────────────────────────────────────────────────

function getAtividadeColeta(limite = 20) {
  return db
    .prepare(`
      SELECT fonte, tipo, exercicio, mes, registros, novos, atualizados, status, erro, coletado_em
      FROM transparencia_coletas_log
      ORDER BY coletado_em DESC
      LIMIT ?
    `)
    .all(limite);
}

function getAtividadeColetas(limite = 15) {
  return db
    .prepare(`
      SELECT fonte, tipo, total, novos, atualizados, status, iniciado_em, concluido_em
      FROM coletas_log
      ORDER BY iniciado_em DESC
      LIMIT ?
    `)
    .all(limite);
}

// ── Resumo de atividade IA (últimas 24h) ─────────────────────────────────────

function getAtividadeIa24h() {
  return db
    .prepare(`
      SELECT
        COUNT(*)                           AS total,
        SUM(status = 'ok')                 AS ok,
        SUM(status = 'erro')               AS erro,
        MIN(atualizado_em)                 AS primeiro,
        MAX(atualizado_em)                 AS ultimo
      FROM documentos_resumos_ai_jobs
      WHERE atualizado_em >= datetime('now', '-24 hours')
        AND status IN ('ok', 'erro')
    `)
    .get();
}

// ── FTS ───────────────────────────────────────────────────────────────────────

function getFtsStatus() {
  try {
    const n = db
      .prepare("SELECT COUNT(*) n FROM documentos_fts WHERE documentos_fts MATCH 'pregao*'")
      .get().n;
    return { indexado: n > 0, matches_pregao: n };
  } catch {
    return { indexado: false, matches_pregao: 0 };
  }
}

// ── Snapshot completo ─────────────────────────────────────────────────────────

function getAdminSnapshot() {
  return {
    jobs: getJobsStatus(),
    cobertura: getCoberturaVencedores(),
    fts: getFtsStatus(),
    atividade_ia_24h: getAtividadeIa24h(),
    erros_recentes: getErrosRecentes(8),
    atividade_coleta: getAtividadeColeta(10),
  };
}

module.exports = {
  getJobsStatus,
  getErrosRecentes,
  getCoberturaVencedores,
  getAtividadeColeta,
  getAtividadeColetas,
  getAtividadeIa24h,
  getFtsStatus,
  getAdminSnapshot,
};
