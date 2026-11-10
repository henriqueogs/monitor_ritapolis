'use strict';

/**
 * Coleta leis ordinárias específicas da legislação da Prefeitura (lacuna do acervo).
 *
 * Uso: node scripts/coletar-leis-alvo.js 1181/2010,1315/2014,1198/2011,1399/2016
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const ColetorLegislacaoPrefeitura = require('../src/coletores/site-prefeitura-legislacao');

async function main() {
  const alvos = String(process.argv[2] || '')
    .split(',')
    .filter(Boolean)
    .map(par => {
      const [numero, ano] = par.split('/').map(Number);
      return { numero, ano };
    });
  if (!alvos.length || alvos.some(a => !a.numero || !a.ano)) {
    throw new Error('Informe leis no formato numero/ano, separadas por vírgula');
  }
  setupDatabase();
  const resultado = await new ColetorLegislacaoPrefeitura({ alvos }).run();
  console.warn(JSON.stringify(resultado, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
