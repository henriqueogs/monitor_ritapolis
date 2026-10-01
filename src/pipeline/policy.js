'use strict';
const crypto = require('crypto');

const VOLATILE = new Set(['gerado_em', 'atualizado_em', 'criado_em', 'coletado_em', 'duracao_ms']);
function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter(k => !VOLATILE.has(k))
        .map(k => [k, stableValue(value[k])])
    );
  }
  return value;
}
function hash(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex');
}
function localTime(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map(p => [p.type, p.value])
  );
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
function isRecent(doc, now = new Date()) {
  const since = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  // A technical re-scrape of 2025 must never masquerade as a new publication.
  return doc.data_publicacao
    ? doc.data_publicacao.slice(0, 10) >= since
    : Number(doc.ano) >= Number(localTime(now).day.slice(0, 4)) &&
        (doc.coletado_em || '').slice(0, 10) >= since;
}
function transientError(error) {
  return /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|SQLITE_BUSY|timeout|timed out|worker_interrupted|HTTP (429|5\d\d)|\b429\b|\b50[0234]\b/i.test(
    String(error)
  );
}
function factsSignature(db, pending) {
  const rows = db
    .prepare(
      `SELECT entity, input_hash FROM pipeline_jobs p WHERE kind = 'facts' AND status = 'ok'
    AND id = (SELECT MAX(id) FROM pipeline_jobs p2 WHERE p2.kind = 'facts' AND p2.status = 'ok' AND p2.entity = p.entity)
    ORDER BY entity`
    )
    .all();
  const map = new Map(rows.map(r => [r.entity, r.input_hash]));
  if (pending) {
    map.set(pending.entity, pending.input_hash);
  }
  return hash([...map].sort((a, b) => a[0].localeCompare(b[0])));
}
module.exports = { hash, stableValue, localTime, isRecent, transientError, factsSignature };
