'use strict';

// Fila de jobs de regeneração de resumo de anexo — mesmo padrão de
// documentos_resumos_ai_jobs (src/db/ai-jobs-repo.js), aplicado a anexos.
// Sem regra de negócio — só persistência.

const { db } = require('./connection');

function normalizeJob(row) {
  if (!row) {
    return null;
  }
  return { ...row, force: Boolean(row.force) };
}

function createAnexoResumoJob({ anexo_id, provider, modelo, contrato_versao, texto_hash, force = false }) {
  const existing = db
    .prepare(
      `SELECT *
         FROM documentos_anexos_resumos_ai_jobs
        WHERE anexo_id = @anexo_id
          AND texto_hash = @texto_hash
          AND contrato_versao = @contrato_versao
          AND status IN ('pendente', 'processando')
        ORDER BY datetime(atualizado_em) DESC, id DESC
        LIMIT 1`
    )
    .get({ anexo_id, texto_hash, contrato_versao });

  if (existing) {
    return normalizeJob(existing);
  }

  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO documentos_anexos_resumos_ai_jobs (
         anexo_id, provider, modelo, contrato_versao, texto_hash,
         status, force, criado_em, atualizado_em
       ) VALUES (
         @anexo_id, @provider, @modelo, @contrato_versao, @texto_hash,
         'pendente', @force, @criado_em, @atualizado_em
       )`
    )
    .run({
      anexo_id,
      provider,
      modelo,
      contrato_versao,
      texto_hash,
      force: force ? 1 : 0,
      criado_em: now,
      atualizado_em: now,
    });

  return getAnexoResumoJobById(result.lastInsertRowid);
}

function getAnexoResumoJobById(id) {
  return normalizeJob(db.prepare('SELECT * FROM documentos_anexos_resumos_ai_jobs WHERE id = ?').get(id));
}

function getNextPendingAnexoResumoJob() {
  return normalizeJob(
    db
      .prepare(
        `SELECT *
           FROM documentos_anexos_resumos_ai_jobs
          WHERE status = 'pendente'
          ORDER BY datetime(criado_em) ASC, id ASC
          LIMIT 1`
      )
      .get()
  );
}

function listAnexoResumoJobs({ limite = 20, status } = {}) {
  const filters = [];
  const params = { limite: Math.min(Math.max(Number(limite || 20), 1), 100) };
  if (status) {
    filters.push('status = @status');
    params.status = status;
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  return db
    .prepare(
      `SELECT * FROM documentos_anexos_resumos_ai_jobs
        ${where}
        ORDER BY datetime(atualizado_em) DESC, id DESC
        LIMIT @limite`
    )
    .all(params)
    .map(normalizeJob);
}

function recoverStaleAnexoResumoJobs({ staleMinutes = 30 } = {}) {
  const now = new Date().toISOString();
  const threshold = new Date(Date.now() - Number(staleMinutes || 30) * 60 * 1000).toISOString();
  const result = db
    .prepare(
      `UPDATE documentos_anexos_resumos_ai_jobs
          SET status = 'pendente',
              erro = NULL,
              atualizado_em = @now
        WHERE status = 'processando'
          AND atualizado_em < @threshold`
    )
    .run({ now, threshold });

  return { recovered: result.changes, threshold, staleMinutes: Number(staleMinutes || 30) };
}

function markAnexoResumoJobProcessing(id) {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE documentos_anexos_resumos_ai_jobs
        SET status = 'processando',
            tentativas = tentativas + 1,
            iniciado_em = COALESCE(iniciado_em, @now),
            atualizado_em = @now
      WHERE id = @id
        AND status = 'pendente'`
  ).run({ id, now });

  return getAnexoResumoJobById(id);
}

function finishAnexoResumoJobOk(id, resumoAiId = null) {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE documentos_anexos_resumos_ai_jobs
        SET status = 'ok',
            erro = NULL,
            resumo_ai_id = @resumoAiId,
            finalizado_em = @now,
            atualizado_em = @now
      WHERE id = @id`
  ).run({ id, resumoAiId, now });

  return getAnexoResumoJobById(id);
}

function finishAnexoResumoJobError(id, erro) {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE documentos_anexos_resumos_ai_jobs
        SET status = 'erro',
            erro = @erro,
            finalizado_em = @now,
            atualizado_em = @now
      WHERE id = @id`
  ).run({ id, erro: String(erro || 'Erro desconhecido'), now });

  return getAnexoResumoJobById(id);
}

module.exports = {
  createAnexoResumoJob,
  getAnexoResumoJobById,
  getNextPendingAnexoResumoJob,
  listAnexoResumoJobs,
  recoverStaleAnexoResumoJobs,
  markAnexoResumoJobProcessing,
  finishAnexoResumoJobOk,
  finishAnexoResumoJobError,
};
