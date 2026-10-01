'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
test('real process exit after one saved chunk resumes without rereading it or publishing a partial summary', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ritapolis-summary-resume-'));
  const file = path.join(dir, 'isolated.db');
  const script = path.join(__dirname, '__fixtures__', 'summary-resume-child.js');
  try {
    expect(
      spawnSync(process.execPath, [script, file, 'interrupt'], {
        encoding: 'utf8',
        windowsHide: true,
      }).status
    ).toBe(23);
    let db = new DatabaseSync(file, { readOnly: true });
    expect(db.prepare('SELECT COUNT(*) AS n FROM final').get().n).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM audit').get().n).toBe(1);
    db.close();
    expect(
      spawnSync(process.execPath, [script, file], { encoding: 'utf8', windowsHide: true }).status
    ).toBe(0);
    db = new DatabaseSync(file, { readOnly: true });
    try {
      expect(db.prepare('SELECT COUNT(*) AS n FROM final').get().n).toBe(1);
      expect(db.prepare('SELECT COUNT(*) AS n FROM audit').get().n).toBe(4);
      expect(db.prepare('SELECT COUNT(DISTINCT prompt) AS n FROM audit').get().n).toBe(4);
      expect(JSON.parse(db.prepare('SELECT value FROM final').get().value).status).toBe('ok');
    } finally {
      db.close();
    }
  } finally {
    // Exact directory created above, never a user or workspace data directory.
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
