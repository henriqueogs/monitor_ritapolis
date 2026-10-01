'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

test.each(['after-first', 'inside-transaction'])(
  'real child process exit (%s) resumes the original input without lost or duplicate canonical rows',
  crash => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ritapolis-financial-resume-'));
    const file = path.join(dir, 'isolated.db');
    const script = path.join(__dirname, '__fixtures__', 'financial-resume-child.js');
    try {
      const stopped = spawnSync(process.execPath, [script, file, crash], {
        encoding: 'utf8',
        windowsHide: true,
      });
      expect(stopped.status).toBe(23);
      const resumed = spawnSync(process.execPath, [script, file], {
        encoding: 'utf8',
        windowsHide: true,
      });
      expect(resumed.status).toBe(0);
      expect(JSON.parse(resumed.stdout)).toEqual({
        novos: 3,
        atualizados: 0,
        semAlteracao: 0,
        registros: 3,
      });
      const db = new DatabaseSync(file, { readOnly: true });
      try {
        expect(
          db
            .prepare('SELECT id FROM rows ORDER BY id')
            .all()
            .map(row => row.id)
        ).toEqual([1, 2, 3]);
        expect(db.prepare("SELECT COUNT(*) AS n FROM audit WHERE event='download'").get().n).toBe(
          1
        );
        expect(
          db.prepare("SELECT COUNT(*) AS n FROM audit WHERE event='detail' AND id=1").get().n
        ).toBe(crash === 'after-first' ? 1 : 2);
      } finally {
        db.close();
      }
    } finally {
      // Exact test-created directory, never a workspace or user-data path.
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
);
