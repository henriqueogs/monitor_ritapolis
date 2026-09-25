'use strict';

/**
 * Consultas agregadas para a saúde do pipeline de IA (só leitura).
 * A avaliação (ok/alerta) fica em src/ai/pipeline-saude.js.
 */

const { db } = require('./connection');

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
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN IFNULL(d.texto_completo, '') <> '' THEN 1 ELSE 0 END) AS total,
         SUM(CASE WHEN IFNULL(d.texto_completo, '') <> '' AND r.documento_id IS NULL THEN 1 ELSE 0 END) AS sem_resumo,
         SUM(CASE WHEN IFNULL(d.texto_completo, '') = '' THEN 1 ELSE 0 END) AS sem_texto,
         MIN(CASE WHEN IFNULL(d.texto_completo, '') <> '' AND r.documento_id IS NULL
                  THEN d.data_publicacao END) AS mais_antigo
       FROM documentos d
       LEFT JOIN (
         SELECT DISTINCT documento_id FROM documentos_resumos_ai WHERE status = 'ok'
       ) r ON r.documento_id = d.id
       WHERE d.data_publicacao >= :desde`
    )
    .get({ desde });
  return {
    total: row.total || 0,
    semResumo: row.sem_resumo || 0,
    semTexto: row.sem_texto || 0,
    maisAntigoSemResumo: row.mais_antigo || null,
  };
}

module.exports = { getUltimoResumoOk, getUltimoErroResumo, contarRecentesSemResumo };
