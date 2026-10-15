'use strict';

/**
 * Base do ranking de fornecedores (lado "empenhado"): soma por CNPJ só de empenho
 * ORDINÁRIO. OP duplicaria o gasto e EE/EG são previsão — nenhum entra no total.
 * Recebe o handle do banco por parâmetro (evita ciclo com src/db/index.js).
 */

const { SQL_TIPO_ORDINARIO } = require('./tipo-empenho');

function agregarEmpenhosPorCredor(db) {
  return db
    .prepare(
      `SELECT
         credor_cnpj AS cnpj,
         MAX(credor_nome) AS nome,
         COUNT(*) AS n_empenhos,
         SUM(COALESCE(valor, 0)) AS total_valor,
         GROUP_CONCAT(DISTINCT CAST(exercicio_orcamento AS TEXT)) AS anos
       FROM transparencia_despesas
       WHERE credor_cnpj IS NOT NULL AND credor_cnpj <> ''
         AND ${SQL_TIPO_ORDINARIO}
         AND UPPER(IFNULL(credor_nome, '')) NOT LIKE '%FOLHA%'
         AND UPPER(IFNULL(credor_nome, '')) NOT LIKE '%INSS%'
         AND UPPER(IFNULL(credor_nome, '')) NOT LIKE '%FGTS%'
         AND UPPER(IFNULL(credor_nome, '')) NOT LIKE '%PASEP%'
         AND UPPER(IFNULL(credor_nome, '')) NOT LIKE '%RECEITA FEDERAL%'
       GROUP BY credor_cnpj`
    )
    .all();
}

module.exports = { agregarEmpenhosPorCredor };
