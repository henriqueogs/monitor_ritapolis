'use strict';
function isOversized(error) {
  return /maxContentLength|maxBodyLength|excede o limite/i.test(String(error?.message));
}
function createFilePolicy(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS pipeline_file_limits (
    url TEXT PRIMARY KEY, reason TEXT NOT NULL, next_check_at TEXT NOT NULL
  )`);
  return {
    check(url, now = new Date()) {
      const row = db.prepare('SELECT * FROM pipeline_file_limits WHERE url = ?').get(url);
      if (row && row.next_check_at > now.toISOString()) {
        throw new Error(`${row.reason}; arquivo em revisao ate ${row.next_check_at}`);
      }
    },
    record(url, error, now = new Date()) {
      if (!isOversized(error)) {
        return;
      }
      db.prepare(
        `INSERT INTO pipeline_file_limits VALUES (?, ?, ?)
        ON CONFLICT(url) DO UPDATE SET reason=excluded.reason, next_check_at=excluded.next_check_at`
      ).run(url, error.message, new Date(now.getTime() + 30 * 86400000).toISOString());
    },
    isOversizedReview(url) {
      const row = db.prepare('SELECT reason FROM pipeline_file_limits WHERE url = ?').get(url);
      return Boolean(row) && isOversized({ message: row.reason });
    },
    clear(url) {
      db.prepare('DELETE FROM pipeline_file_limits WHERE url=?').run(url);
    },
  };
}
module.exports = { createFilePolicy, isOversized };
