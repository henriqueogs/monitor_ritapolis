'use strict';

/**
 * Leitura dos empenhos de diárias (3.3.90.14) para a vertente agregada de diárias. Devolve a
 * chave interna do beneficiário só para contar pessoas; nada pessoal sai da vertente.
 */

const { db } = require('./connection');

function listarEmpenhosDeDiarias({ anoMin = 0 } = {}) {
  return db
    .prepare(
      `SELECT id, empenho, exercicio_orcamento, tipo, data_empenho, valor, credor_chave,
              categoria_economica
         FROM transparencia_despesas
        WHERE tipo LIKE 'EO%' AND categoria_economica LIKE '3.3.90.14%'
          AND exercicio_orcamento >= ? AND data_empenho IS NOT NULL AND valor > 0`
    )
    .all(anoMin);
}

module.exports = { listarEmpenhosDeDiarias };
