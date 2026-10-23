'use strict';

/**
 * Gera descobertas "empenhado acima do contratado": empenhos que citam um
 * processo licitatório e somam mais de 125% do valor do contrato publicado.
 * Grava em 'revisao' (nunca publica sozinho).
 *
 * Uso:
 *   node scripts/gerar-descobertas-execucao.js            # grava
 *   node scripts/gerar-descobertas-execucao.js --dry-run  # só lista sinais
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { gerarDescobertasExecucao } = require('../src/alertas/execucao-contratual-runner');

function main() {
  const dryRun = process.argv.includes('--dry-run');
  setupDatabase();

  const resultado = gerarDescobertasExecucao({ dryRun });
  for (const s of resultado.sinais) {
    console.warn(
      `- Processo ${s.processo} · ${s.credor_nome}: contrato ${s.valor_contrato} · empenhado ${s.valor_empenhado} (${s.razao.toFixed(2)}×)`
    );
  }
  console.warn(
    `${dryRun ? '[dry-run] ' : ''}${resultado.sinais.length} sinal(is), ${resultado.gravados} descoberta(s) gravada(s).`
  );
}

main();
