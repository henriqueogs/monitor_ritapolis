'use strict';
const crypto = require('crypto');

const VOLATILE = new Set([
  'gerado_em', 'atualizado_em', 'criado_em', 'coletado_em', 'duracao_ms',
  // listarAnexosDocumento also exposes these dates as SQL aliases. The facts
  // runner updates the local summary; hashing its date would queue itself again.
  'resumo_criado_em', 'resumo_atualizado_em',
]);
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
// Teto de execução de uma tarefa no worker (coordinator mata com SIGKILL ao passar).
// O backup copia, confere e compacta o banco inteiro (3 GB em 27/11/2026): na E2.1.Micro
// com CPU roubada isso passa de 10 min, o worker morria no meio e deixava a cópia parcial
// (141 sobras, 20 GB, disco em 95%).
const LIMITE_EXECUCAO_PADRAO_MS = 10 * 60000;
const LIMITE_EXECUCAO_MS = { backup: 60 * 60000 };
function limiteExecucaoMs(kind) {
  return LIMITE_EXECUCAO_MS[kind] ?? LIMITE_EXECUCAO_PADRAO_MS;
}
// JSON malformado vem de amostragem do modelo: tentar de novo costuma resolver.
function transientError(error) {
  return /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|SQLITE_BUSY|timeout|timed out|worker_interrupted|HTTP (429|5\d\d)|\b429\b|\b50[0234]\b|IA nao (retornou|contem) JSON valido/i.test(
    String(error)
  );
}
function factsSignature(db, pending) {
  const rows = db
    .prepare(
      // Um facts ok mais recente por documento. A forma com subconsulta correlacionada era
      // O(n²) e levava ~3 min com 28 mil jobs (cada facts e cada analysis pagava isso).
      `SELECT p.entity, p.input_hash FROM pipeline_jobs p
    JOIN (SELECT entity, MAX(id) AS ultimo FROM pipeline_jobs
          WHERE kind = 'facts' AND status = 'ok' GROUP BY entity) m ON p.id = m.ultimo
    ORDER BY p.entity`
    )
    .all();
  const map = new Map(rows.map(r => [r.entity, r.input_hash]));
  if (pending) {
    map.set(pending.entity, pending.input_hash);
  }
  return hash([...map].sort((a, b) => a[0].localeCompare(b[0])));
}
module.exports = {
  hash, stableValue, localTime, isRecent, transientError, factsSignature,
  limiteExecucaoMs, LIMITE_EXECUCAO_PADRAO_MS,
};
