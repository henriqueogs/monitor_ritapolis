'use strict';

class PipelineYield extends Error {
  constructor() {
    super('pipeline_yield: progresso salvo; continuar na proxima fatia');
    this.code = 'PIPELINE_YIELD';
  }
}

// One technical checkpoint per completed step, addressed by authoritative
// input and operation version. No second queue, copies of PDFs or public data.
function createProgress(db, namespace, { deadline = Date.now() + 8 * 60000 } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS pipeline_progress (
    namespace TEXT NOT NULL, step TEXT NOT NULL, value TEXT NOT NULL,
    PRIMARY KEY(namespace, step)
  )`);
  return {
    remainingMs() {
      return Math.max(1, deadline - Date.now());
    },
    clear() {
      db.prepare('DELETE FROM pipeline_progress WHERE namespace = ?').run(namespace);
    },
    checkTime() {
      if (Date.now() >= deadline) {
        throw new PipelineYield();
      }
    },
    load(step) {
      const row = db
        .prepare('SELECT value FROM pipeline_progress WHERE namespace = ? AND step = ?')
        .get(namespace, step);
      return row ? JSON.parse(row.value) : null;
    },
    save(step, value) {
      db.prepare(
        `INSERT INTO pipeline_progress VALUES (?, ?, ?)
        ON CONFLICT(namespace,step) DO UPDATE SET value = excluded.value WHERE value <> excluded.value`
      ).run(namespace, step, JSON.stringify(value));
    },
  };
}
module.exports = { createProgress, PipelineYield };
