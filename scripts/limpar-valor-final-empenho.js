'use strict';

/**
 * Remove de licitacoes_detalhes o valor_final que foi derivado da soma de
 * empenhos (origem_detalhe `empenho_agregado`): empenhado não é homologado.
 * O vencedor e a origem permanecem para auditoria.
 *
 * Uso:
 *   node scripts/limpar-valor-final-empenho.js            # dry-run (não grava)
 *   node scripts/limpar-valor-final-empenho.js --apply    # efetiva
 *
 * Depois de aplicar, rode `node scripts/consolidar-fornecedores.js` (ou o scheduler diário)
 * para regravar fornecedores_perfil.
 */

const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');
const {
  diagnosticarValorFinalDeEmpenho,
  limparValorFinalDeEmpenho,
} = require('../src/transparencia/valor-final-empenho');

function main() {
  const apply = process.argv.includes('--apply');
  setupDatabase();

  const antes = diagnosticarValorFinalDeEmpenho(db);
  console.warn(`valor_final derivado de empenho: ${antes.n} registro(s), R$ ${antes.valor_total}`);

  if (!apply) {
    console.warn('Dry-run: nada gravado. Use --apply para efetivar.');
    return;
  }
  const r = limparValorFinalDeEmpenho(db);
  console.warn(`Limpos: ${r.n} registro(s).`);
}

main();
