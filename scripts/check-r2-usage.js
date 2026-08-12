'use strict';

const { fetchR2Usage } = require('../src/storage/r2-usage-monitor');

fetchR2Usage()
  .then((report) => {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.evaluation.status === 'blocked') { process.exitCode = 2; }
  })
  .catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
