'use strict';

/**
 * Reclassifica documentos com tipo='documento_publico' que são, na verdade,
 * processos de compra. Usa o sinal autoritativo de cada camada em vez de
 * adivinhar pelo título (que foi exatamente o que causou a má classificação):
 *
 *   - papel='edital'   no grupo  → tipo 'edital'
 *   - papel='contrato' no grupo  → tipo 'contrato'
 *   - papel='ata'                → mantém 'documento_publico' (não há tipo 'ata';
 *                                  fica visível via listagem por grupo — Fase 4)
 *   - sem grupo, mas inferTipo()  → reclassifica conforme o classificador novo
 *   - não-licitação (ex.: conselheira tutelar) → mantém 'documento_publico'
 *
 * Uso:
 *   node scripts/reclassificar-tipos.js            # dry-run (não grava)
 *   node scripts/reclassificar-tipos.js --apply    # efetiva as mudanças
 */

const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');
const { inferTipo } = require('../src/coletores/site-prefeitura');

const PAPEL_PARA_TIPO = {
  edital: 'edital',
  contrato: 'contrato',
};

function planejarReclassificacoes() {
  const docs = db
    .prepare(
      `SELECT d.id, d.titulo,
              (SELECT gd.papel
                 FROM licitacoes_grupo_documentos gd
                WHERE gd.documento_id = d.id
                ORDER BY CASE gd.papel WHEN 'edital' THEN 0 WHEN 'contrato' THEN 1 ELSE 2 END
                LIMIT 1) AS papel
         FROM documentos d
        WHERE d.tipo = 'documento_publico'
        ORDER BY d.id`
    )
    .all();

  const mudancas = [];
  for (const doc of docs) {
    let novoTipo = null;

    if (doc.papel && PAPEL_PARA_TIPO[doc.papel]) {
      novoTipo = PAPEL_PARA_TIPO[doc.papel];
    } else if (!doc.papel) {
      // Sem grupo: confiar no classificador corrigido sobre o título.
      const inferido = inferTipo(doc.titulo);
      if (inferido !== 'documento_publico') {
        novoTipo = inferido;
      }
    }

    if (novoTipo && novoTipo !== 'documento_publico') {
      mudancas.push({ id: doc.id, titulo: doc.titulo, papel: doc.papel || '(sem grupo)', novoTipo });
    }
  }

  return mudancas;
}

function main() {
  const apply = process.argv.includes('--apply');
  setupDatabase();

  const mudancas = planejarReclassificacoes();

  console.warn(`Documentos a reclassificar: ${mudancas.length}`);
  const porTipo = mudancas.reduce((acc, m) => {
    acc[m.novoTipo] = (acc[m.novoTipo] || 0) + 1;
    return acc;
  }, {});
  console.warn('Distribuição por novo tipo:', JSON.stringify(porTipo));

  for (const m of mudancas) {
    console.warn(`  #${m.id} [${m.papel}] → ${m.novoTipo} :: ${m.titulo.slice(0, 70)}`);
  }

  if (!apply) {
    console.warn('\nDry-run. Nenhuma mudança gravada. Rode com --apply para efetivar.');
    return;
  }

  const update = db.prepare(
    "UPDATE documentos SET tipo = @tipo, atualizado_em = CURRENT_TIMESTAMP WHERE id = @id"
  );
  db.exec('BEGIN');
  try {
    for (const m of mudancas) {
      update.run({ id: m.id, tipo: m.novoTipo });
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  console.warn(`\n${mudancas.length} documentos reclassificados.`);
}

main();
