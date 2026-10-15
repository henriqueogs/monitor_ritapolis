'use strict';

/**
 * Base do ranking de fornecedores (lado "empenhado"): soma por CNPJ só de empenho
 * ORDINÁRIO. OP duplicaria o gasto e EE/EG são previsão — nenhum entra no total.
 * Recebe o handle do banco por parâmetro (evita ciclo com src/db/index.js).
 */

const { SQL_TIPO_ORDINARIO } = require('./tipo-empenho');
const { sqlValorFinalDeEmpenho } = require('./valor-final-empenho');

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

/**
 * Vitórias e valor homologado por CNPJ. Valor derivado de empenho
 * (ver valor-final-empenho) é empenhado, não licitado: a vitória
 * conta, o valor não.
 */
function agregarVencedoresPorCnpj(db) {
  return db
    .prepare(
      `SELECT
         vencedor_cnpj AS cnpj,
         vencedor_nome AS nome,
         COUNT(DISTINCT documento_id) AS n_licitacoes,
         COUNT(*) AS n_vitorias,
         SUM(CASE WHEN ${sqlValorFinalDeEmpenho('ld')}
                  THEN 0 ELSE COALESCE(valor_final, 0) END) AS total_valor,
         GROUP_CONCAT(DISTINCT CAST(d.ano AS TEXT)) AS anos
       FROM licitacoes_detalhes ld
       JOIN documentos d ON d.id = ld.documento_id
       WHERE vencedor_cnpj IS NOT NULL AND vencedor_cnpj <> ''
       GROUP BY vencedor_cnpj`
    )
    .all();
}

module.exports = { agregarEmpenhosPorCredor, agregarVencedoresPorCnpj };
