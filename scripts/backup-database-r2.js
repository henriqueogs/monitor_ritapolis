'use strict';

const { backupDatabaseToR2 } = require('../src/storage/r2-database-backup');

backupDatabaseToR2()
  .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
  .catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
