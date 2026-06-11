'use strict';

/**
 * Gate de plausibilidade de valores finais de licitação.
 *
 * Varre `licitacoes_detalhes` e, para todo `valor_final` fora da faixa plausível
 * (ver src/licitacoes/valores.js), descarta o valor — o campo passa a ser exibido
 * como "não verificado" (lacuna explícita, princípio do projeto). O valor rejeitado
 * e o motivo ficam registrados em `origem_detalhe` para auditoria.
 *
 * Uso:
 *   node scripts/aplicar-gate-valores.js            # dry-run (não grava)
 *   node scripts/aplicar-gate-valores.js --apply    # efetiva
 */

const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');
const { avaliarValorFinal } = require('../src/licitacoes/valores');

function planejar() {
  const rows = db
    .prepare(
      'SELECT documento_id, valor_final, origem, origem_detalhe FROM licitacoes_detalhes WHERE valor_final IS NOT NULL'
    )
    .all();

  return rows
    .map((r) => ({ ...r, avaliacao: avaliarValorFinal(r.valor_final) }))
    .filter((r) => !r.avaliacao.plausivel);
}

function main() {
  const apply = process.argv.includes('--apply');
  setupDatabase();

  const alvos = planejar();
  console.warn(`Valores finais implausíveis encontrados: ${alvos.length}`);
  for (const a of alvos) {
    console.warn(`  doc #${a.documento_id}: R$ ${a.valor_final} → não verificado (${a.avaliacao.motivo})`);
  }

  if (!apply) {
    console.warn('\nDry-run. Nada gravado. Rode com --apply para efetivar.');
    return;
  }

  const update = db.prepare(
    `UPDATE licitacoes_detalhes
        SET valor_final = NULL,
            origem_detalhe = TRIM(IFNULL(origem_detalhe, '') || ' | valor_final_invalidado(' || @valor || ',' || @motivo || ')'),
            atualizado_em = CURRENT_TIMESTAMP
      WHERE documento_id = @documento_id`
  );

  db.exec('BEGIN');
  try {
    for (const a of alvos) {
      update.run({ documento_id: a.documento_id, valor: a.valor_final, motivo: a.avaliacao.motivo });
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  console.warn(`\n${alvos.length} valor(es) invalidado(s) e marcado(s) para auditoria.`);
}

main();
