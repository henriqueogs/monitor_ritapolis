'use strict';

/**
 * Repositório de consultas agregadas/pontuais sobre transparencia_despesas
 * (página de empenho e painéis de gasto). Só CRUD/queries — classificação
 * cidadã de categoria acontece nos services (DDD).
 * Separado de transparencia-repo.js, que já excede o limite de LOC.
 */

const { db } = require('./index');

const LIMITE_EXEMPLOS = 5;

function prefixosWhere(prefixos, coluna = 'categoria_economica') {
  const clausulas = prefixos.map(() => `${coluna} LIKE ?`).join(' OR ');
  const params = prefixos.map((p) => `${p}%`);
  return { sql: `(${clausulas})`, params };
}

function getDespesaById(id) {
  const row = db
    .prepare(
      `SELECT td.*, d.titulo AS documento_titulo, d.numero AS documento_numero
       FROM transparencia_despesas td
       LEFT JOIN documentos d ON d.id = td.documento_id
       WHERE td.id = ?`
    )
    .get(Number(id));
  return row || null;
}

/**
 * Outros empenhos do mesmo credor no exercício (exclui o empenho de origem).
 */
function getResumoRelacionados({ credorCnpj, exercicio, exceptId }) {
  const filtro = `credor_cnpj = ? AND exercicio_orcamento = ? AND id != ?`;
  const params = [credorCnpj, Number(exercicio), Number(exceptId)];

  const total = db
    .prepare(`SELECT COUNT(*) AS n, ROUND(SUM(valor), 2) AS valor_total
              FROM transparencia_despesas WHERE ${filtro}`)
    .get(...params);

  const exemplos = db
    .prepare(
      `SELECT id, empenho, data_empenho, valor, historico
       FROM transparencia_despesas WHERE ${filtro}
       ORDER BY data_empenho DESC, valor DESC LIMIT ${LIMITE_EXEMPLOS}`
    )
    .all(...params);

  return { n: total.n, valor_total: total.valor_total || 0, exemplos };
}

/**
 * Agregado de uma categoria (lista de prefixos de código) num exercício.
 */
function getResumoCategoriaAno({ prefixos, exercicio, exceptId = 0 }) {
  const where = prefixosWhere(prefixos);
  const filtro = `${where.sql} AND exercicio_orcamento = ? AND id != ?`;
  const params = [...where.params, Number(exercicio), Number(exceptId)];

  const total = db
    .prepare(`SELECT COUNT(*) AS n, ROUND(SUM(valor), 2) AS valor_total
              FROM transparencia_despesas WHERE ${filtro}`)
    .get(...params);

  const exemplos = db
    .prepare(
      `SELECT id, empenho, data_empenho, valor, historico
       FROM transparencia_despesas WHERE ${filtro}
       ORDER BY valor DESC LIMIT ${LIMITE_EXEMPLOS}`
    )
    .all(...params);

  return { n: total.n, valor_total: total.valor_total || 0, exemplos };
}

module.exports = {
  getDespesaById,
  getResumoRelacionados,
  getResumoCategoriaAno,
};
