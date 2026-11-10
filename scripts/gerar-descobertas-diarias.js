'use strict';

/**
 * Gera descobertas agregadas de diárias: alta sobre o mesmo período do ano anterior (no mesmo
 * mandato) e concentração em poucos beneficiários. Sem nomes (LGPD). Grava em 'revisao'.
 *
 * Uso:
 *   node scripts/gerar-descobertas-diarias.js [--ano-min 2025]           # só lista (dry-run)
 *   node scripts/gerar-descobertas-diarias.js [--ano-min 2025] --apply   # grava
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { gerarDescobertasDiarias } = require('../src/alertas/diarias-runner');

const argumento = nome => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

function main() {
  const apply = process.argv.includes('--apply');
  setupDatabase();
  const r = gerarDescobertasDiarias({
    anoMin: Number(argumento('--ano-min')) || 0,
    dryRun: !apply,
  });
  for (const c of r.lista) {console.warn(`- ${c.titulo}`);}
  console.warn(
    `${apply ? '' : '[dry-run] '}${r.candidatos} candidato(s), ${r.gravados} gravado(s).`
  );
}

main();
