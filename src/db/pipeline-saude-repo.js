'use strict';

/**
 * Consultas agregadas para a saúde do pipeline de IA (só leitura).
 * A avaliação (ok/alerta) fica em src/ai/pipeline-saude.js.
 */

const { db } = require('./connection');
const crypto = require('crypto');
const config = require('../config');

function getUltimoResumoOk() {
  const row = db
    .prepare(
      `SELECT atualizado_em AS em, provider, modelo
       FROM documentos_resumos_ai
       WHERE status = 'ok'
       ORDER BY atualizado_em DESC, id DESC
       LIMIT 1`
    )
    .get();
  return row ? { em: row.em, provider: row.provider, modelo: row.modelo } : null;
}

function getUltimoErroResumo() {
  const row = db
    .prepare(
      `SELECT em, erro FROM (
         SELECT atualizado_em AS em, erro FROM documentos_resumos_ai
         WHERE status = 'erro' AND erro IS NOT NULL
         UNION ALL
         SELECT atualizado_em AS em, erro FROM documentos_resumos_ai_jobs
         WHERE status = 'erro' AND erro IS NOT NULL
       )
       ORDER BY em DESC
       LIMIT 1`
    )
    .get();
  return row ? { em: row.em, erro: row.erro } : null;
}

/**
 * Documentos publicados desde `desde` (YYYY-MM-DD): quantos têm texto (universo
 * resumível), quantos desses não têm nenhum resumo ok, e quantos não têm texto.
 */
function contarRecentesSemResumo({ desde }) {
  const result = { total: 0, semResumo: 0, semTexto: 0, maisAntigoSemResumo: null };
  const current = db.prepare(`SELECT 1 FROM documentos_resumos_ai WHERE documento_id = ?
    AND texto_hash = ? AND contrato_versao = ? AND status = 'ok'`);
  for (const doc of db
    .prepare(
      `SELECT id,texto_completo,data_publicacao FROM documentos
    WHERE data_publicacao >= ?`
    )
    .all(desde)) {
    if (!doc.texto_completo?.trim()) {
      result.semTexto++;
      continue;
    }
    result.total++;
    const signature = crypto.createHash('sha256').update(doc.texto_completo).digest('hex');
    if (!current.get(doc.id, signature, config.aiContractVersion)) {
      result.semResumo++;
      if (!result.maisAntigoSemResumo || doc.data_publicacao < result.maisAntigoSemResumo) {
        result.maisAntigoSemResumo = doc.data_publicacao;
      }
    }
  }
  return result;
}

const KINDS_IA = "'extract','summary','items','integrated','facts','extract-anexo','anexo-summary'";

/**
 * Progresso da força-tarefa histórica. Erros voltam crus (só para o serviço
 * classificar; nunca expor). `desde` = ISO do início da janela de 24h.
 */
function getCampanhaHistorica({ desde }) {
  const um = (sql, ...p) => db.prepare(sql).get(...p);
  return {
    docsUltimas24h: um(
      `SELECT COUNT(DISTINCT entity) AS n FROM pipeline_runs
       WHERE historical = 1 AND kind IN (${KINDS_IA}) AND finished_at >= ?`,
      desde
    ).n,
    ultimaExecucaoEm: um(
      `SELECT MAX(finished_at) AS em FROM pipeline_runs
       WHERE historical = 1 AND kind IN (${KINDS_IA})`
    ).em,
    pendentes: um(
      `SELECT COUNT(*) AS n FROM pipeline_jobs
       WHERE historical = 1 AND status = 'pending' AND kind IN (${KINDS_IA})`
    ).n,
    semResumoComTexto: um(
      `SELECT COUNT(*) AS n FROM documentos d
       WHERE LENGTH(COALESCE(d.texto_completo, '')) >= 50
         AND NOT EXISTS (SELECT 1 FROM documentos_resumos_ai r
                         WHERE r.documento_id = d.id AND r.status = 'ok')`
    ).n,
    errosRecentes: db
      .prepare(
        `SELECT error FROM pipeline_jobs
         WHERE historical = 1 AND error IS NOT NULL AND finished_at >= ?
           AND kind IN (${KINDS_IA})`
      )
      .all(desde)
      .map((r) => r.error),
  };
}

module.exports = {
  getUltimoResumoOk,
  getUltimoErroResumo,
  contarRecentesSemResumo,
  getCampanhaHistorica,
};
