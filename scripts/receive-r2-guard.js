'use strict';
// Forced SSH command. Accept only a small metrics document on stdin, never a
// shell command, token, path or service-control request.
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const config = require('../src/config');
const target =
  process.env.R2_GUARD_REPORT_PATH || path.join(path.dirname(config.dbPath), 'r2-guard.json');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  input += chunk;
  if (input.length > 65536) {
    console.error('Relatorio excede limite');
    process.exit(1);
  }
});
process.stdin.on('end', () => {
  try {
    const source = JSON.parse(input);
    const status = source.evaluation?.status;
    const checked = Date.parse(source.usage?.checkedAt);
    if (
      !['ok', 'warning', 'blocked'].includes(status) ||
      !Number.isFinite(checked) ||
      Math.abs(Date.now() - checked) > 3600000
    ) {
      throw new Error('Relatorio invalido ou antigo');
    }
    const metrics = ['storageBytes', 'classAOperations', 'classBOperations'];
    if (
      status !== 'blocked' &&
      metrics.some(k => !Number.isFinite(source.usage[k]) || !Number.isFinite(source.limits?.[k]))
    ) {
      throw new Error('Metricas incompletas');
    }
    const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o?.[k] ?? null]));
    const report = {
      usage: pick(source.usage, [
        'checkedAt',
        'cycleStart',
        'storageObservedAt',
        'storageBytes',
        'classAOperations',
        'classBOperations',
        'objectCount',
      ]),
      limits: pick(source.limits, metrics),
      evaluation: { status },
    };
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(`${target}.pending`, JSON.stringify(report), { mode: 0o600 });
    fs.renameSync(`${target}.pending`, target);
    console.info(`Guard atualizado: ${status}; leituras da API permanecem disponiveis`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
});
