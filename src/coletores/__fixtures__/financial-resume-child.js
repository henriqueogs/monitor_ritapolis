'use strict';
const { DatabaseSync } = require('node:sqlite');
const { createProgress } = require('../../pipeline/progress');
const { checkpointInput, processRows } = require('../financial-resume');
const [file, crash] = process.argv.slice(2);
const db = new DatabaseSync(file);
db.exec(`CREATE TABLE IF NOT EXISTS rows(id INTEGER PRIMARY KEY);
  CREATE TABLE IF NOT EXISTS audit(event TEXT, id INTEGER);`);
const progress = createProgress(db, 'actual-process-job');
(async () => {
  const rows = await checkpointInput(progress, 'window', async () => {
    db.exec("INSERT INTO audit(event) VALUES('download')");
    return [1, 2, 3];
  });
  const stats = await processRows(
    progress,
    'window',
    rows,
    async id => {
      if (crash === 'after-first' && id === 2) {
        process.exit(23);
      }
      db.prepare("INSERT INTO audit(event,id) VALUES('detail',?)").run(id);
      return id;
    },
    id => {
      db.prepare('INSERT INTO rows VALUES(?)').run(id);
      if (crash === 'inside-transaction' && id === 1) {
        process.exit(23);
      }
      return 'inserted';
    }
  );
  process.stdout.write(JSON.stringify(stats));
  db.close();
})().catch(error => {
  process.stderr.write(error.message);
  process.exitCode = 1;
});
