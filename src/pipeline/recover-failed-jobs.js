'use strict';
const crypto = require('node:crypto');
const { classifyAiError } = require('../ai/classificar-erro-ia');

function recoverable(job) {
  if (job.kind === 'collection') {
    return job.entity === 'pncp' && /^PNCP HTTP 403(?:; PNCP HTTP 403)*$/.test(job.error || '');
  }
  const timeout = classifyAiError(job.error) === 'timeout';
  return (job.kind === 'items' && timeout) || (job.kind === 'summary' &&
    (timeout || /Resposta da IA nao retornou JSON valido/.test(job.error || '')));
}

function blockedReason(db, job, { allowExhausted, validateInput }) {
  if (!job || job.status !== 'failed') { return 'not_failed'; }
  if (db.prepare('SELECT 1 FROM pipeline_meta WHERE key=?').get(`manual_recovery:${job.id}`)) {
    return 'already_recovered';
  }
  if (db.prepare(`SELECT 1 FROM pipeline_jobs WHERE kind=? AND entity=? AND id>?
    AND status IN ('pending','running','ok','failed') LIMIT 1`).get(job.kind, job.entity, job.id)) {
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
  if (!Array.isArray(jobIds) || !jobIds.length || jobIds.length > 10 ||
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

module.exports = { recoverFailedJobs };
