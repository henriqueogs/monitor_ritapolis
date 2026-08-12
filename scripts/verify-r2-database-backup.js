'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { restoreDatabaseFromR2IfMissing } = require('../src/storage/r2-database-backup');

async function main() {
  const target = path.join(os.tmpdir(), `monitor-ritapolis-r2-verify-${process.pid}-${Date.now()}.db`);
  try {
    const restored = await restoreDatabaseFromR2IfMissing({ dbPath: target });
    const db = new DatabaseSync(target, { readOnly: true });
    try {
      const integrity = db.prepare('PRAGMA integrity_check').get().integrity_check;
      if (integrity !== 'ok') { throw new Error(`Backup R2 invalido: ${integrity}`); }
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all()
        .map((row) => row.name);
      const counts = {};
      for (const table of ['documentos', 'licitacoes_produtos', 'transparencia_empenhos', 'alertas']) {
        if (tables.includes(table)) {
          counts[table] = db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total;
        }
      }
      process.stdout.write(`${JSON.stringify({ restored, integrity, tables: tables.length, counts }, null, 2)}\n`);
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(target, { force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
