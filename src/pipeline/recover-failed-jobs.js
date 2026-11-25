'use strict';
const crypto = require('node:crypto');
const { classifyAiError } = require('../ai/classificar-erro-ia');

const CATEGORIA_CONTRATO_REJEITADO = 'contrato_rejeitado';
// Categorias que `listarCandidatos` aceita: só as que `recoverable` retoma por categoria.
const CATEGORIA_REVISAO_FONTE = 'revisao_fonte';
const ERRO_GATE_OCR = 'texto_baixa_qualidade_ocr';
const CATEGORIAS_LISTAVEIS = new Set([CATEGORIA_CONTRATO_REJEITADO, CATEGORIA_REVISAO_FONTE]);
// anexo-summary usa o documento como entity: o "mesmo job" é o do mesmo anexo, não o do documento.
const MESMO_ALVO = `(newer.kind <> 'anexo-summary'
  OR json_extract(newer.payload,'$.anexoId') = json_extract(p.payload,'$.anexoId'))`;
const LIMITE_LISTAGEM_PADRAO = 10;
const LIMITE_LOTE = 10;

// Itens: a saída incompleta recusada pelo contrato estrito (ZodError) não depende da fonte;
// a retomada reaproveita os trechos já validados e repete só o trecho recusado. Um segundo
// recuso encerra a tarefa (uma retomada por tarefa, ver `already_recovered`).
function recoverable(job) {
  if (job.kind === 'collection') {
    return job.entity === 'pncp' && /^PNCP HTTP 403(?:; PNCP HTTP 403)*$/.test(job.error || '');
  }
  const categoria = classifyAiError(job.error);
  const timeout = categoria === 'timeout';
  if (job.kind === 'items') { return timeout || categoria === CATEGORIA_CONTRATO_REJEITADO; }
  // Gate de OCR corrigido (linha de assinatura não é lixo): o mesmo texto pode ser reavaliado.
  if (job.kind === 'anexo-summary') { return job.error === ERRO_GATE_OCR; }
  return job.kind === 'summary' &&
    (timeout || /Resposta da IA nao retornou JSON valido/.test(job.error || ''));
}

// Falhas mais recentes de cada etapa/entidade na categoria pedida, ainda sem retomada manual.
// Só lista: a retomada continua exigindo IDs explícitos, motivo e as checagens de `recoverFailedJobs`.
function listarCandidatos(db, { categoria, limite = LIMITE_LISTAGEM_PADRAO } = {}) {
  if (!CATEGORIAS_LISTAVEIS.has(categoria)) {
    throw new Error(`Listagem aceita só a categoria ${[...CATEGORIAS_LISTAVEIS].join(', ')}`);
  }
  const rows = db.prepare(`SELECT id, kind, entity, attempts, error FROM pipeline_jobs p
    WHERE status = 'failed' AND NOT EXISTS (
      SELECT 1 FROM pipeline_jobs newer WHERE newer.kind = p.kind AND newer.entity = p.entity
        AND newer.id > p.id AND newer.status IN ('pending','running','ok','failed') AND ${MESMO_ALVO})
      AND NOT EXISTS (SELECT 1 FROM pipeline_meta m WHERE m.key = 'manual_recovery:' || p.id)
    ORDER BY id DESC`).all();
  return rows
    .filter(job => classifyAiError(job.error) === categoria && recoverable(job))
    .slice(0, limite)
    .map(({ id, kind, entity, attempts }) => ({ id, kind, entity, attempts }));
}

function blockedReason(db, job, { allowExhausted, validateInput }) {
  if (!job || job.status !== 'failed') { return 'not_failed'; }
  if (db.prepare('SELECT 1 FROM pipeline_meta WHERE key=?').get(`manual_recovery:${job.id}`)) {
    return 'already_recovered';
  }
  if (db.prepare(`SELECT 1 FROM pipeline_jobs p JOIN pipeline_jobs newer
    ON newer.kind = p.kind AND newer.entity = p.entity AND newer.id > p.id
    WHERE p.id = ? AND newer.status IN ('pending','running','ok','failed') AND ${MESMO_ALVO}
    LIMIT 1`).get(job.id)) {
    return 'newer_job';
  }
  if (!recoverable(job)) { return 'not_recoverable'; }
  if (job.attempts >= 3 && !allowExhausted) { return 'attempts_exhausted'; }
  const valid = validateInput(job);
  return valid === true ? null : typeof valid === 'string' ? valid : 'input_changed';
}

function resumeJob(db, job, { now, reason }) {
  const audit = { at: now.toISOString(), reason, attempts: job.attempts,
    category: classifyAiError(job.error),
    error_hash: crypto.createHash('sha256').update(job.error || '').digest('hex') };
  db.prepare('INSERT INTO pipeline_meta(key,value) VALUES (?,?)')
    .run(`manual_recovery:${job.id}`, JSON.stringify(audit));
  // No reset of attempts or budget, no new identity, and no checkpoint deletion.
  db.prepare(`UPDATE pipeline_jobs SET status='pending',error=NULL,available_at=?,lease_until=NULL
    WHERE id=? AND status='failed'`).run(now.toISOString(), job.id);
}

function recoverFailedJobs(db, options) {
  const { jobIds, reason, apply = false, now = new Date(), validateInput, assertSafety } = options;
  if (!Array.isArray(jobIds) || !jobIds.length || jobIds.length > LIMITE_LOTE ||
      jobIds.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(jobIds).size !== jobIds.length) {
    throw new Error('Informe de um a dez IDs de tarefas distintos e positivos');
  }
  if (typeof reason !== 'string' || reason.trim().length < 10 || reason.length > 300 ||
      typeof validateInput !== 'function' || typeof assertSafety !== 'function') {
    throw new Error('Motivo, validacao de fonte e verificacao de seguranca obrigatorios');
  }
  const report = { apply, changes: [], blocked: [] };
  if (apply) { assertSafety(); db.exec('BEGIN IMMEDIATE'); }
  try {
    for (const id of jobIds) {
      const job = db.prepare('SELECT * FROM pipeline_jobs WHERE id=?').get(id);
      const blocked = blockedReason(db, job, options);
      if (blocked) { report.blocked.push({ id, reason: blocked }); continue; }
      if (apply) { resumeJob(db, job, { now, reason }); }
      report.changes.push({ id, kind: job.kind, entity: job.entity, attempts: job.attempts,
        historical: Boolean(job.historical), checkpoints_preserved: true });
    }
    if (apply) { db.exec('COMMIT'); }
    return report;
  } catch (error) {
    if (apply) { db.exec('ROLLBACK'); }
    throw error;
  }
}

// Percorre todos os candidatos da categoria em lotes do tamanho que `recoverFailedJobs` aceita.
// Cada lote mantém as mesmas travas (fonte, segurança, uma retomada por tarefa); os bloqueados
// são contados por motivo e pulados. `max` limita quantas tarefas voltam à fila nesta execução.
function retomarCategoria(db, { categoria, max = Infinity, ...opcoes }) {
  const candidatos = listarCandidatos(db, { categoria, limite: Infinity });
  const relatorio = { apply: Boolean(opcoes.apply), lotes: 0, retomados: 0, bloqueados: {}, ids: [] };
  let inicio = 0;
  while (inicio < candidatos.length && relatorio.retomados < max) {
    const tamanho = Math.min(LIMITE_LOTE, max - relatorio.retomados);
    const lote = candidatos.slice(inicio, inicio + tamanho).map(c => c.id);
    inicio += tamanho;
    const { changes, blocked } = recoverFailedJobs(db, { ...opcoes, jobIds: lote });
    relatorio.lotes++;
    relatorio.retomados += changes.length;
    relatorio.ids.push(...changes.map(c => c.id));
    for (const { reason } of blocked) {
      relatorio.bloqueados[reason] = (relatorio.bloqueados[reason] || 0) + 1;
    }
  }
  return relatorio;
}

module.exports = { recoverFailedJobs, listarCandidatos, retomarCategoria };
