#!/usr/bin/env node
'use strict';

const { reprocessarInvestigacoesPendentes } = require('../src/inteligencia/discovery-investigation-runner');

function parseArgs(argv) {
  const out = {};
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--limite=')) {
      out.limite = Number(arg.slice('--limite='.length));
    } else if (arg.startsWith('--delay-ms=')) {
      out.delayMs = Number(arg.slice('--delay-ms='.length));
    } else if (arg === '--force') {
      out.force = true;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  console.log('Descobertas IA — reprocessando pendentes', args);
  const result = await reprocessarInvestigacoesPendentes(args);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
