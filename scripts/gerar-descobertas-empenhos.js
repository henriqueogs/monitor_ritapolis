'use strict';

/**
 * Gera descobertas de gasto atípico por categoria a partir dos empenhos do
 * Portal da Transparência (detector puro + thresholds de alertas_config).
 *
 * Uso:
 *   node scripts/gerar-descobertas-empenhos.js            # grava
 *   node scripts/gerar-descobertas-empenhos.js --dry-run  # só lista sinais
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { gerarDescobertasEmpenhos } = require('../src/alertas/empenhos-runner');

function main() {
  const dryRun = process.argv.includes('--dry-run');
  setupDatabase();

  const resultado = gerarDescobertasEmpenhos({ dryRun });
  console.warn(
    `${dryRun ? '[dry-run] ' : ''}${resultado.sinais} sinal(is) detectado(s), ${resultado.gravados} descoberta(s) gravada(s).`
  );
  console.warn('Thresholds:', JSON.stringify(resultado.thresholds));
}

main();
