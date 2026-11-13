'use strict';

/**
 * Anula `licitacoes_produtos.unidade` quando o valor é lixo de parser (ver
 * src/licitacoes/unidade-lixo.js). Unidade nula só faz o item sair da comparação de preços;
 * nada é inventado. Dry-run por padrão.
 *
 * Uso:
 *   node scripts/limpar-unidades-lixo.js           # lista e conta
 *   node scripts/limpar-unidades-lixo.js --apply   # grava
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');
const { ehUnidadeLixo } = require('../src/licitacoes/unidade-lixo');

const AMOSTRA = 15;

function main() {
  const apply = process.argv.includes('--apply');
  setupDatabase();
  const distintas = db
    .prepare(
      'SELECT unidade, COUNT(*) AS n FROM licitacoes_produtos WHERE unidade IS NOT NULL GROUP BY unidade'
    )
    .all();
  const lixo = distintas.filter(u => ehUnidadeLixo(u.unidade));
  const linhas = lixo.reduce((t, u) => t + u.n, 0);
  let gravadas = 0;
  if (apply) {
    const anula = db.prepare('UPDATE licitacoes_produtos SET unidade = NULL WHERE unidade = ?');
    for (const u of lixo) {
      gravadas += Number(anula.run(u.unidade).changes);
    }
  }
  const amostra = lixo
    .sort((a, b) => b.n - a.n)
    .slice(0, AMOSTRA)
    .map(u => `${JSON.stringify(u.unidade.slice(0, 50))}: ${u.n}`);
  console.warn(
    JSON.stringify(
      {
        modo: apply ? 'apply' : 'dry-run',
        valoresDistintos: lixo.length,
        linhas,
        gravadas,
        amostra,
      },
      null,
      2
    )
  );
}

main();
