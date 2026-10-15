'use strict';

/**
 * Saneamento de licitacoes_detalhes.valor_final gravado a partir de empenho.
 * Empenhado não é homologado: o valor sai, o vencedor e a origem ficam para
 * auditoria. Recebe o db por parâmetro.
 *
 * Marcador do valor derivado de empenho (preciso de propósito):
 *  - `origem_detalhe` começando com `empenho_agregado`: rótulo atual;
 *  - `origem = 'portal_transparencia'` com origem_detalhe NULL: legado do
 *    enriquecimento antigo (único escritor dessa origem, que sobrescrevia o valor).
 * `origem_detalhe` com NOME DE ARQUIVO (ata/contrato) NÃO entra: são valores de
 * documento, e a maioria não bate com a soma de empenhos. Ficam para revisão.
 */

/** Condição SQL (sem WHERE) que identifica valor_final derivado de empenho. */
function sqlValorFinalDeEmpenho(alias = '') {
  const prefixo = alias ? `${alias}.` : '';
  return `(COALESCE(${prefixo}origem_detalhe, '') LIKE 'empenho_agregado%' OR (COALESCE(${prefixo}origem, '') = 'portal_transparencia' AND ${prefixo}origem_detalhe IS NULL))`;
}

const FILTRO_VALOR_DE_EMPENHO = `${sqlValorFinalDeEmpenho()} AND valor_final IS NOT NULL`;

function diagnosticarValorFinalDeEmpenho(db) {
  const r = db
    .prepare(`SELECT COUNT(*) AS n, ROUND(IFNULL(SUM(valor_final), 0), 2) AS valor_total FROM licitacoes_detalhes WHERE ${FILTRO_VALOR_DE_EMPENHO}`)
    .get();
  return { n: r.n, valor_total: r.valor_total };
}

/** Linhas afetadas, para backup antes de limpar (a limpeza é irreversível). */
function listarValorFinalDeEmpenho(db) {
  return db
    .prepare(`SELECT documento_id, vencedor_cnpj, valor_final, origem, origem_detalhe FROM licitacoes_detalhes WHERE ${FILTRO_VALOR_DE_EMPENHO} ORDER BY documento_id`)
    .all();
}

function limparValorFinalDeEmpenho(db) {
  const r = db
    .prepare(`UPDATE licitacoes_detalhes SET valor_final = NULL, atualizado_em = CURRENT_TIMESTAMP WHERE ${FILTRO_VALOR_DE_EMPENHO}`)
    .run();
  return { n: Number(r.changes) };
}

module.exports = {
  sqlValorFinalDeEmpenho,
  diagnosticarValorFinalDeEmpenho,
  listarValorFinalDeEmpenho,
  limparValorFinalDeEmpenho,
};
