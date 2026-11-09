'use strict';

/**
 * Gera descobertas "preço acima da referência": mesmo produto e unidade em vários empenhos,
 * com algum item muito acima da mediana. Grava em 'revisao' (nunca publica sozinho).
 *
 * Uso:
 *   node scripts/gerar-descobertas-preco.js [--ano-min 2025]           # só lista (dry-run)
 *   node scripts/gerar-descobertas-preco.js [--ano-min 2025] --apply   # grava
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { gerarDescobertasPreco } = require('../src/alertas/preco-itens-runner');

const argumento = nome => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

function main() {
  const apply = process.argv.includes('--apply');
  setupDatabase();
  const r = gerarDescobertasPreco({ anoMin: Number(argumento('--ano-min')) || 0, dryRun: !apply });
  for (const c of r.lista) {
    console.warn(`- ${c.titulo} [${c.metrica.itens} itens]`);
  }
  console.warn(
    `${apply ? '' : '[dry-run] '}${r.candidatos} candidato(s), ${r.gravados} gravado(s).`
  );
}

main();
