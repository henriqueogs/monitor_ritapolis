'use strict';

/**
 * Itens da nota fiscal de cada empenho (tabela transparencia_despesas_itens). A gravação
 * substitui os itens do empenho por inteiro, então coletar de novo não duplica.
 */

const { db } = require('./connection');

const SEM_LIMITE = -1;

function substituirItens(exercicio, empenho, itens) {
  const despesa = db
    .prepare('SELECT id FROM transparencia_despesas WHERE exercicio_orcamento = ? AND empenho = ?')
    .get(exercicio, empenho);
  if (!despesa) {
    return 0;
  }
  const insere = db.prepare(
    `INSERT INTO transparencia_despesas_itens
       (despesa_id, nota_fiscal, item, produto_codigo, produto, complemento, unidade, marca,
        quantidade, valor_unitario, valor_total)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  db.exec('SAVEPOINT itens_despesa');
  try {
    db.prepare('DELETE FROM transparencia_despesas_itens WHERE despesa_id = ?').run(despesa.id);
    for (const i of itens) {
      insere.run(
        despesa.id,
        i.nota_fiscal ?? null,
        i.item,
        i.produto_codigo ?? null,
        i.produto ?? null,
        i.complemento ?? null,
        i.unidade ?? null,
        i.marca ?? null,
        i.quantidade ?? null,
        i.valor_unitario ?? null,
        i.valor_total ?? null
      );
    }
    db.exec('RELEASE itens_despesa');
  } catch (erro) {
    db.exec('ROLLBACK TO itens_despesa');
    db.exec('RELEASE itens_despesa');
    throw erro;
  }
  return itens.length;
}

// Empenhos originais que já têm modalidade (compraram sob licitação ou dispensa, logo têm nota
// fiscal) e ainda não têm itens gravados.
function listarSemItens({ anoMin = 0, limite = SEM_LIMITE } = {}) {
  return db
    .prepare(
      `SELECT d.id, d.empenho, d.exercicio_orcamento, d.tipo
         FROM transparencia_despesas d
        WHERE d.tipo LIKE 'EO%' AND d.exercicio_orcamento >= ?
          AND d.modalidade IS NOT NULL AND TRIM(d.modalidade) <> ''
          AND NOT EXISTS (SELECT 1 FROM transparencia_despesas_itens i WHERE i.despesa_id = d.id)
        ORDER BY d.exercicio_orcamento DESC, d.id
        LIMIT ?`
    )
    .all(anoMin, limite);
}

module.exports = { substituirItens, listarSemItens };
