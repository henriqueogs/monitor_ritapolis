'use strict';

/**
 * Gera descobertas "compras repetidas sem instrumento localizado": empenhos originais do mesmo
 * credor PJ e objeto semelhante, em até 90 dias, cada um abaixo do limite de dispensa e somando
 * acima dele. Grava em 'revisao' (nunca publica sozinho).
 *
 * Uso:
 *   node scripts/gerar-descobertas-compras-repetidas.js            # só lista (dry-run)
 *   node scripts/gerar-descobertas-compras-repetidas.js --apply    # grava
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { gerarDescobertasComprasRepetidas } = require('../src/alertas/compras-repetidas-runner');

function main() {
  const apply = process.argv.includes('--apply');
  setupDatabase();

  const r = gerarDescobertasComprasRepetidas({ dryRun: !apply });
  for (const c of r.lista) {
    console.warn(`- ${c.titulo} [${c.periodo.inicio}..${c.periodo.fim}]`);
  }
  console.warn(
    `${apply ? '' : '[dry-run] '}${r.candidatos} candidato(s), ${r.descartados} descartado(s), ` +
      `${r.gravados} gravado(s).`
  );
}

main();
