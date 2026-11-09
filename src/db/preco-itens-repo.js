'use strict';

/**
 * Leitura dos itens de nota fiscal com os dados do empenho, para a vertente de preço acima da
 * referência. Só query; a regra fica em src/alertas/vertentes/preco-itens.js.
 */

const { db } = require('./connection');

function listarItensComparaveis({ anoMin = 0 } = {}) {
  return db
    .prepare(
      `SELECT i.id AS item_id, i.despesa_id, d.empenho, d.exercicio_orcamento, d.tipo,
              d.data_empenho, d.credor_cnpj, d.credor_nome, d.historico,
              i.produto_codigo, i.produto, i.complemento, i.unidade, i.quantidade,
              i.valor_unitario, i.valor_total
         FROM transparencia_despesas_itens i
         JOIN transparencia_despesas d ON d.id = i.despesa_id
        WHERE d.tipo LIKE 'EO%' AND d.exercicio_orcamento >= ? AND d.data_empenho IS NOT NULL
          AND i.produto_codigo IS NOT NULL`
    )
    .all(anoMin);
}

module.exports = { listarItensComparaveis };
