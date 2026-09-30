'use strict';
// Explicit rollout verification, never called by heartbeat or API startup.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../src/config');
const { createDailySnapshot, restoreDailySnapshot } = require('../src/storage/daily-snapshot');
async function main() {
  const snapshot = await createDailySnapshot({ dbPath: config.dbPath });
  const directory = fs.mkdtempSync(path.join(path.dirname(config.dbPath), 'daily-restore-check-'));
  const restoredPath = path.join(directory, 'ritapolis.db');
  const restored = await restoreDailySnapshot({ dbPath: restoredPath, isolated: true });
  const db = new DatabaseSync(restoredPath, { readOnly: true });
  let counts;
  try {
    counts = Object.fromEntries(
      [
        'documentos',
        'documentos_resumos_ai',
        'transparencia_despesas',
        'transparencia_receitas',
        'transparencia_folha',
      ]
        .filter(table =>
          db.prepare("SELECT 1 FROM sqlite_master WHERE name = ? AND type = 'table'").get(table)
        )
        .map(table => [table, db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n])
    );
  } finally {
    db.close();
  }
  const result = {
    snapshot,
    restored: { integrity: restored.integrity, databaseBytes: restored.databaseBytes },
    counts,
    isolatedPath: restoredPath,
  };
  // Preserve the isolated restore as evidence until separately authorized
  // cleanup. Only 1 file, not an extra recurring backup flow.
  fs.writeFileSync(path.join(directory, 'validation.json'), JSON.stringify(result, null, 2));
  console.info(JSON.stringify(result));
}
main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
