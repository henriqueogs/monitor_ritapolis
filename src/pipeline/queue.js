'use strict';

// Durable, single-flight queue. Only technical tables are added; public IDs
// and source records are never renumbered or rebuilt.
function createQueue(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS pipeline_jobs (
    id INTEGER PRIMARY KEY, identity TEXT NOT NULL UNIQUE, kind TEXT NOT NULL,
    entity TEXT NOT NULL, input_hash TEXT NOT NULL, version TEXT NOT NULL,
    payload TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 50,
    historical INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
    available_at TEXT NOT NULL, created_at TEXT NOT NULL, started_at TEXT,
    finished_at TEXT, lease_until TEXT, result TEXT, error TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS pipeline_single_running
    ON pipeline_jobs((1)) WHERE status = 'running';
  CREATE INDEX IF NOT EXISTS pipeline_pending ON pipeline_jobs(status, priority, available_at);
  CREATE INDEX IF NOT EXISTS pipeline_entity_stage ON pipeline_jobs(entity,kind,status,finished_at);
  CREATE TABLE IF NOT EXISTS pipeline_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS pipeline_runs (id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL, kind TEXT NOT NULL,
    entity TEXT NOT NULL, historical INTEGER NOT NULL, finished_at TEXT NOT NULL, duration_ms INTEGER NOT NULL);`);
  function get(id) {
    return db.prepare('SELECT * FROM pipeline_jobs WHERE id = ?').get(id);
  }
  function enqueue(
    { kind, entity, hash, version = '1', payload = {}, priority = 50, historical = false },
    now = new Date()
  ) {
    const identity = JSON.stringify([kind, String(entity), hash, version]);
    const old = db.prepare('SELECT * FROM pipeline_jobs WHERE identity = ?').get(identity);
    if (old) {
      return old;
    }
    const iso = now.toISOString();
    const row = db
      .prepare(
        `INSERT OR IGNORE INTO pipeline_jobs
      (identity, kind, entity, input_hash, version, payload, priority, historical, available_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
      )
      .get(
        identity,
        kind,
        String(entity),
        hash,
        version,
        JSON.stringify(payload),
        priority,
        Number(historical),
        iso,
        iso
      );
    return row || db.prepare('SELECT * FROM pipeline_jobs WHERE identity = ?').get(identity);
  }
  function claim(now = new Date(), { paused = false } = {}) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const iso = now.toISOString();
      const dayStart = `${require('./policy').localTime(now).day}T03:00:00.000Z`;
      // Expired tasks were killed or the coordinator died. Resume from the
      // committed source window/stage, with a bounded retry count.
      db.prepare(
        `INSERT INTO pipeline_runs(job_id,kind,entity,historical,finished_at,duration_ms)
        SELECT id,kind,entity,historical,?,600000 FROM pipeline_jobs WHERE status = 'running' AND lease_until < ?`
      ).run(iso, iso);
      db.prepare(
        `UPDATE pipeline_jobs SET status = CASE WHEN attempts < 3 THEN 'pending' ELSE 'failed' END,
        lease_until = NULL, available_at = ?, error = 'worker_interrupted'
        WHERE status = 'running' AND lease_until < ?`
      ).run(iso, iso);
      const spent = db
        .prepare(
          `SELECT COALESCE(SUM(duration_ms),0) AS ms
        FROM pipeline_runs WHERE historical = 1 AND finished_at >= ?`
        )
        .get(dayStart).ms;
      const aiKinds =
        "'extract','summary','items','integrated','facts','extract-anexo','anexo-summary'";
      const row = db
        .prepare(
          `SELECT * FROM pipeline_jobs WHERE status = 'pending' AND available_at <= ?
        AND (? = 0 OR kind = 'backup') AND (? < 3000000 OR historical = 0)
        AND (historical = 0 OR kind NOT IN (${aiKinds})
          OR entity IN (SELECT entity FROM pipeline_runs WHERE historical = 1 AND kind IN (${aiKinds}) AND finished_at >= @dayStart)
          OR (SELECT COUNT(DISTINCT entity) FROM pipeline_runs WHERE historical = 1 AND kind IN (${aiKinds}) AND finished_at >= @dayStart) < 10)
        AND NOT EXISTS (SELECT 1 FROM pipeline_jobs WHERE status = 'running')
        ORDER BY priority, created_at, id LIMIT 1`
        )
        .get({ dayStart }, iso, Number(paused), spent);
      if (row) {
        db.prepare(
          `UPDATE pipeline_jobs SET status = 'running', attempts = attempts + 1,
          started_at = ?, lease_until = ? WHERE id = ?`
        ).run(iso, new Date(now.getTime() + 11 * 60000).toISOString(), row.id);
      }
      db.exec('COMMIT');
      return row ? get(row.id) : null;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  function finish(
    id,
    { result = null, error = null, transient = false, deferred = false } = {},
    now = new Date()
  ) {
    const row = get(id);
    if (!row || row.status !== 'running') {
      return;
    }
    const retry = error && transient && row.attempts < 3;
    const delay = row.attempts === 1 ? 30 * 60000 : 2 * 3600000;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        'INSERT INTO pipeline_runs(job_id,kind,entity,historical,finished_at,duration_ms) VALUES (?,?,?,?,?,?)'
      ).run(
        row.id,
        row.kind,
        row.entity,
        row.historical,
        now.toISOString(),
        Math.max(0, now.getTime() - Date.parse(row.started_at))
      );
      db.prepare(
        `UPDATE pipeline_jobs SET status = ?, result = ?, error = ?, finished_at = ?,
      available_at = ?, lease_until = NULL, attempts = attempts - ? WHERE id = ? AND status = 'running'`
      ).run(
        deferred ? 'pending' : error ? (retry ? 'pending' : 'failed') : 'ok',
        JSON.stringify(result, (key, value) =>
          [
            'resumo_json',
            'texto_completo',
            'dados',
            'itens',
            'resultados',
            'raw_response',
          ].includes(key)
            ? undefined
            : value
        ),
        error,
        now.toISOString(),
        new Date(now.getTime() + (deferred ? 10000 : retry ? delay : 0)).toISOString(),
        Number(deferred),
        id
      );
      if (
        !error &&
        !deferred &&
        db
          .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pipeline_progress'")
          .get()
      ) {
        db.prepare('DELETE FROM pipeline_progress WHERE namespace=?').run(row.identity);
      }
      db.exec('COMMIT');
    } catch (failure) {
      db.exec('ROLLBACK');
      throw failure;
    }
  }
  function setMeta(key, value) {
    const serialized = JSON.stringify(value);
    db.prepare(
      `INSERT INTO pipeline_meta VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value
      WHERE value <> excluded.value`
    ).run(key, serialized);
  }
  function meta(key) {
    const row = db.prepare('SELECT value FROM pipeline_meta WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : null;
  }
  function status() {
    return {
      counts: db
        .prepare('SELECT status, kind, COUNT(*) AS total FROM pipeline_jobs GROUP BY status, kind')
        .all(),
      active:
        db
          .prepare(
            "SELECT id, kind, entity, started_at FROM pipeline_jobs WHERE status = 'running'"
          )
          .get() || null,
      oldest_pending: db
        .prepare("SELECT MIN(created_at) AS at FROM pipeline_jobs WHERE status = 'pending'")
        .get().at,
      oldest_pending_recent: db
        .prepare(
          "SELECT MIN(created_at) AS at FROM pipeline_jobs WHERE status='pending' AND historical=0"
        )
        .get().at,
      failures: db
        .prepare(
          `SELECT id, kind, entity, attempts, error, finished_at FROM pipeline_jobs p
          WHERE status = 'failed' AND NOT EXISTS (
            SELECT 1 FROM pipeline_jobs newer WHERE newer.kind=p.kind AND newer.entity=p.entity
              AND newer.id>p.id AND newer.status IN ('pending','running','ok','failed')
          ) ORDER BY id DESC LIMIT 10`
        )
        .all(),
      backup: meta('backup'),
    };
  }
  return { enqueue, claim, finish, get, meta, setMeta, status, db };
}
module.exports = { createQueue };
