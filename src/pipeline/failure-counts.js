'use strict';

const { classifyAiError } = require('../ai/classificar-erro-ia');

// Count every unresolved entity/stage; the ten-row display is only a sample.
// Group raw errors inside SQLite and expose only categories and totals.
// `desde` (ISO) restringe às falhas terminadas a partir dessa data; sem ele, todas as não resolvidas.
function getFailureCounts(db, { desde = null } = {}) {
  const counts = new Map();
  const rows = db.prepare(`SELECT error, COUNT(*) AS total FROM pipeline_jobs p
    WHERE status = 'failed' AND NOT EXISTS (
      SELECT 1 FROM pipeline_jobs newer WHERE newer.kind=p.kind AND newer.entity=p.entity
        AND newer.id>p.id AND newer.status IN ('pending','running','ok','failed')
    ) AND (@desde IS NULL OR finished_at >= @desde) GROUP BY error`).all({ desde });
  for (const row of rows) {
    const categoria = classifyAiError(row.error);
    counts.set(categoria, (counts.get(categoria) || 0) + row.total);
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b))
    .map(([categoria, total]) => ({ categoria, total }));
}

module.exports = { getFailureCounts };
