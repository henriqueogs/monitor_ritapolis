'use strict';

/**
 * Saneamento de licitacoes_detalhes.valor_final gravado a partir de empenho.
 * Empenhado não é homologado: o valor sai, o vencedor e a origem ficam para
 * auditoria. Recebe o db por parâmetro.
 *
 * Marcador do valor derivado de empenho:
 *  - `origem = 'portal_transparencia'`: o enriquecimento antigo trocava a origem
 *    e sobrescrevia valor_final com a soma de empenhos, deixando origem_detalhe
 *    com o nome do arquivo anterior (ou NULL);
 *  - `origem_detalhe` começando com `empenho_agregado`: rótulo atual.
 */

/** Condição SQL (sem WHERE) que identifica valor_final derivado de empenho. */
function sqlValorFinalDeEmpenho(alias = '') {
  const prefixo = alias ? `${alias}.` : '';
  return `(COALESCE(${prefixo}origem, '') = 'portal_transparencia' OR COALESCE(${prefixo}origem_detalhe, '') LIKE 'empenho_agregado%')`;
}

const FILTRO_VALOR_DE_EMPENHO = `${sqlValorFinalDeEmpenho()} AND valor_final IS NOT NULL`;

function diagnosticarValorFinalDeEmpenho(db) {
  const r = db
    .prepare(`SELECT COUNT(*) AS n, ROUND(IFNULL(SUM(valor_final), 0), 2) AS valor_total FROM licitacoes_detalhes WHERE ${FILTRO_VALOR_DE_EMPENHO}`)
    .get();
  return { n: r.n, valor_total: r.valor_total };
}

function limparValorFinalDeEmpenho(db) {
  const r = db
    .prepare(`UPDATE licitacoes_detalhes SET valor_final = NULL, atualizado_em = CURRENT_TIMESTAMP WHERE ${FILTRO_VALOR_DE_EMPENHO}`)
    .run();
  return { n: Number(r.changes) };
}

module.exports = { sqlValorFinalDeEmpenho, diagnosticarValorFinalDeEmpenho, limparValorFinalDeEmpenho };
