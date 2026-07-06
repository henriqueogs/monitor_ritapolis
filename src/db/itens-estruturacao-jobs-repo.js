'use strict';

// Fila + resultado de reextração de itens do processo via IA — mesmo padrão
// de anexo-resumo-jobs-repo.js/inteligencia-fatos-repo.js (salvarResumoAnexo),
// aplicado a documento_id em vez de anexo_id. Sem regra de negócio — só
// persistência.

const { db } = require('./connection');

function nowIso() {
  return new Date().toISOString();
}

// ── Resultado (documentos_itens_estruturados) ────────────────────────────────

function mapResultado(row) {
  if (!row) {return null;}
  return { ...row, itens_json: JSON.parse(row.itens_json) };
}

function salvarItensEstruturados({
  documento_id,
  provider,
  modelo,
  contrato_versao,
  itens_json,
  texto_hash,
  confianca = null,
  status = 'ok',
  erro = null,
}) {
  const agora = nowIso();
  db.prepare(
    `INSERT INTO documentos_itens_estruturados (
       documento_id, provider, modelo, contrato_versao, itens_json, texto_hash,
       confianca, status, erro, criado_em, atualizado_em
     ) VALUES (
       @documento_id, @provider, @modelo, @contrato_versao, @itens_json, @texto_hash,
       @confianca, @status, @erro, @agora, @agora
     )
     ON CONFLICT(documento_id, texto_hash, contrato_versao) DO UPDATE SET
       provider = excluded.provider,
       modelo = excluded.modelo,
       itens_json = excluded.itens_json,
       confianca = excluded.confianca,
       status = excluded.status,
       erro = excluded.erro,
       atualizado_em = excluded.atualizado_em`
  ).run({
    documento_id,
    provider,
    modelo,
    contrato_versao,
    itens_json: JSON.stringify(itens_json),
    texto_hash,
    confianca,
    status,
    erro,
    agora,
  });

  const row = db
    .prepare(
      `SELECT * FROM documentos_itens_estruturados
       WHERE documento_id = ? AND texto_hash = ? AND contrato_versao = ?`
    )
    .get(documento_id, texto_hash, contrato_versao);
  return mapResultado(row);
}

function getItensEstruturadosById(id) {
  return mapResultado(db.prepare('SELECT * FROM documentos_itens_estruturados WHERE id = ?').get(id));
}

function getUltimoItensEstruturadosPorDocumento(documentoId) {
  return mapResultado(
    db
      .prepare(
        `SELECT * FROM documentos_itens_estruturados
         WHERE documento_id = ? AND status = 'ok'
         ORDER BY datetime(atualizado_em) DESC, id DESC
         LIMIT 1`
      )
      .get(Number(documentoId))
  );
}

// Seleção de editais candidatos ao backfill em lote (Fase G) — mesmo padrão
// de listDocumentosPendentesResumoAi (ai-jobs-repo.js). A reextração de itens
// só faz sentido pra editais (é onde vive a tabela de itens/lotes).
function listDocumentosPendentesItens({ limite = 20, ano, fonte } = {}) {
  const filters = ["tipo = 'edital'", "IFNULL(texto_completo, '') <> ''"];
  const params = { limite: Math.min(Math.max(Number(limite || 20), 1), 2000) };

  if (ano) {
    filters.push('ano = @ano');
    params.ano = Number(ano);
  }
  if (fonte) {
    filters.push('fonte = @fonte');
    params.fonte = fonte;
  }

  return db
    .prepare(
      `SELECT * FROM documentos
       WHERE ${filters.join(' AND ')}
       ORDER BY COALESCE(data_publicacao, atualizado_em) DESC, id DESC
       LIMIT @limite`
    )
    .all(params);
}

// ── Fila (documentos_itens_estruturacao_ai_jobs) ─────────────────────────────

function normalizeJob(row) {
  if (!row) {return null;}
  return { ...row, force: Boolean(row.force) };
}

function createItensEstruturacaoJob({ documento_id, provider, modelo, contrato_versao, texto_hash, force = false }) {
  const existing = db
    .prepare(
      `SELECT *
         FROM documentos_itens_estruturacao_ai_jobs
        WHERE documento_id = @documento_id
          AND texto_hash = @texto_hash
          AND contrato_versao = @contrato_versao
          AND status IN ('pendente', 'processando')
        ORDER BY datetime(atualizado_em) DESC, id DESC
        LIMIT 1`
    )
    .get({ documento_id, texto_hash, contrato_versao });

  if (existing) {return normalizeJob(existing);}

  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO documentos_itens_estruturacao_ai_jobs (
         documento_id, provider, modelo, contrato_versao, texto_hash,
         status, force, criado_em, atualizado_em
       ) VALUES (
         @documento_id, @provider, @modelo, @contrato_versao, @texto_hash,
         'pendente', @force, @criado_em, @atualizado_em
       )`
    )
    .run({
      documento_id,
      provider,
      modelo,
      contrato_versao,
      texto_hash,
      force: force ? 1 : 0,
      criado_em: now,
      atualizado_em: now,
    });

  return getItensEstruturacaoJobById(result.lastInsertRowid);
}

function getItensEstruturacaoJobById(id) {
  return normalizeJob(db.prepare('SELECT * FROM documentos_itens_estruturacao_ai_jobs WHERE id = ?').get(id));
}

function getNextPendingItensEstruturacaoJob() {
  return normalizeJob(
    db
      .prepare(
        `SELECT * FROM documentos_itens_estruturacao_ai_jobs
         WHERE status = 'pendente'
         ORDER BY datetime(criado_em) ASC, id ASC
         LIMIT 1`
      )
      .get()
  );
}

function listItensEstruturacaoJobs({ limite = 20, status } = {}) {
  const filters = [];
  const params = { limite: Math.min(Math.max(Number(limite || 20), 1), 100) };
  if (status) {
    filters.push('status = @status');
    params.status = status;
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  return db
    .prepare(
      `SELECT * FROM documentos_itens_estruturacao_ai_jobs
        ${where}
        ORDER BY datetime(atualizado_em) DESC, id DESC
        LIMIT @limite`
    )
    .all(params)
    .map(normalizeJob);
}

function recoverStaleItensEstruturacaoJobs({ staleMinutes = 30 } = {}) {
  const now = nowIso();
  const threshold = new Date(Date.now() - Number(staleMinutes || 30) * 60 * 1000).toISOString();
  const result = db
    .prepare(
      `UPDATE documentos_itens_estruturacao_ai_jobs
          SET status = 'pendente',
              erro = NULL,
              atualizado_em = @now
        WHERE status = 'processando'
          AND atualizado_em < @threshold`
    )
    .run({ now, threshold });

  return { recovered: result.changes, threshold, staleMinutes: Number(staleMinutes || 30) };
}

function markItensEstruturacaoJobProcessing(id) {
  const now = nowIso();
  db.prepare(
    `UPDATE documentos_itens_estruturacao_ai_jobs
        SET status = 'processando',
            tentativas = tentativas + 1,
            iniciado_em = COALESCE(iniciado_em, @now),
            atualizado_em = @now
      WHERE id = @id
        AND status = 'pendente'`
  ).run({ id, now });

  return getItensEstruturacaoJobById(id);
}

function finishItensEstruturacaoJobOk(id, itensEstruturadosId = null) {
  const now = nowIso();
  db.prepare(
    `UPDATE documentos_itens_estruturacao_ai_jobs
        SET status = 'ok',
            erro = NULL,
            itens_estruturados_id = @itensEstruturadosId,
            finalizado_em = @now,
            atualizado_em = @now
      WHERE id = @id`
  ).run({ id, itensEstruturadosId, now });

  return getItensEstruturacaoJobById(id);
}

function finishItensEstruturacaoJobError(id, erro) {
  const now = nowIso();
  db.prepare(
    `UPDATE documentos_itens_estruturacao_ai_jobs
        SET status = 'erro',
            erro = @erro,
            finalizado_em = @now,
            atualizado_em = @now
      WHERE id = @id`
  ).run({ id, erro: String(erro || 'Erro desconhecido'), now });

  return getItensEstruturacaoJobById(id);
}

module.exports = {
  salvarItensEstruturados,
  getItensEstruturadosById,
  getUltimoItensEstruturadosPorDocumento,
  listDocumentosPendentesItens,
  createItensEstruturacaoJob,
  getItensEstruturacaoJobById,
  getNextPendingItensEstruturacaoJob,
  listItensEstruturacaoJobs,
  recoverStaleItensEstruturacaoJobs,
  markItensEstruturacaoJobProcessing,
  finishItensEstruturacaoJobOk,
  finishItensEstruturacaoJobError,
};
