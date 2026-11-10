'use strict';

/**
 * Gera descobertas de legislação: lei municipal citada por outra norma e ausente do acervo, e
 * lacunas de numeração no mandato corrente. Grava em 'revisao'.
 *
 * Uso:
 *   node scripts/gerar-descobertas-legislacao.js [--ano-min 2019]           # só lista (dry-run)
 *   node scripts/gerar-descobertas-legislacao.js [--ano-min 2019] --apply   # grava
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { gerarDescobertasLegislacao } = require('../src/alertas/legislacao-runner');

const argumento = nome => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

function main() {
  const apply = process.argv.includes('--apply');
  setupDatabase();
  const r = gerarDescobertasLegislacao({
    anoMin: Number(argumento('--ano-min')) || 0,
    dryRun: !apply,
  });
  for (const c of r.lista) {
    console.warn(`- ${c.titulo}`);
  }
  console.warn(
    `${apply ? '' : '[dry-run] '}${r.candidatos} candidato(s), ${r.gravados} gravado(s).`
  );
}

main();
