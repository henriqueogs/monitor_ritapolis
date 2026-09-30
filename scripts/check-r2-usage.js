'use strict';

const { fetchR2Usage } = require('../src/storage/r2-usage-monitor');

fetchR2Usage()
  .then((report) => {
    if (process.env.R2_GUARD_OUTPUT) { require('fs').writeFileSync(process.env.R2_GUARD_OUTPUT, JSON.stringify(report)); }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.evaluation.status === 'blocked') { process.exitCode = 2; }
  })
  .catch((error) => {
    if (process.env.R2_GUARD_OUTPUT) { require('fs').writeFileSync(process.env.R2_GUARD_OUTPUT, JSON.stringify({ usage: { checkedAt: new Date().toISOString() }, evaluation: { status: 'blocked' } })); }
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
