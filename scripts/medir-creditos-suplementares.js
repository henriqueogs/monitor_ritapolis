'use strict';

/**
 * Mede (somente leitura) os decretos de crédito suplementar de um exercício: quantos têm valor e
 * fonte legíveis e quanto foi aberto por fonte de recurso. Não grava nada.
 *
 * Uso: node scripts/medir-creditos-suplementares.js [--ano 2025]
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');
const { parseCreditoSuplementar } = require('../src/parsers/credito-suplementar');

const CENTAVOS = 100;
const arredonda = n => Math.round(n * CENTAVOS) / CENTAVOS;

function main() {
  const i = process.argv.indexOf('--ano');
  const ano = Number(i >= 0 ? process.argv[i + 1] : 2025);
  setupDatabase();
  const decretos = db
    .prepare(
      `SELECT numero, texto_completo FROM documentos
        WHERE tipo = 'decreto' AND ano = ? AND titulo LIKE '%CRÉDITO SUPLEMENTAR%'`
    )
    .all(ano);
  const porFonte = {};
  let semValor = 0;
  let total = 0;
  const semFonte = [];
  for (const d of decretos) {
    const { valorTotal, fonte } = parseCreditoSuplementar(d.texto_completo);
    if (valorTotal === null) {
      semValor += 1;
      continue;
    }
    total += valorTotal;
    const chave = fonte || 'sem_fonte_legivel';
    porFonte[chave] = arredonda((porFonte[chave] || 0) + valorTotal);
    if (!fonte) {
      semFonte.push(d.numero);
    }
  }
  console.warn(
    JSON.stringify(
      { ano, decretos: decretos.length, semValor, total: arredonda(total), porFonte, semFonte },
      null,
      2
    )
  );
}

main();
