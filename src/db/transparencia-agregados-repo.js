'use strict';

/**
 * Repositório de consultas agregadas/pontuais sobre transparencia_despesas
 * (página de empenho e painéis de gasto). Só CRUD/queries — classificação
 * cidadã de categoria acontece nos services (DDD).
 * Separado de transparencia-repo.js, que já excede o limite de LOC.
 */

const { db } = require('./index');
const {
  CLASSIFICACAO_SELECT,
  CLASSIFICACAO_JOIN,
  decorarDespesaComFinalidade,
} = require('./transparencia-classificacao-repo');
const { vinculoDocumentoExato } = require('../licitacoes/modalidade');

const LIMITE_EXEMPLOS = 5;

function prefixosWhere(prefixos, coluna = 'categoria_economica') {
  const clausulas = prefixos.map(() => `${coluna} LIKE ?`).join(' OR ');
  const params = prefixos.map((p) => `${p}%`);
  return { sql: `(${clausulas})`, params };
}

function getDespesaById(id) {
  const row = db
    .prepare(
      `SELECT td.*, d.titulo AS documento_titulo, d.numero AS documento_numero,
              ${CLASSIFICACAO_SELECT}
       FROM transparencia_despesas td
       ${CLASSIFICACAO_JOIN}
       LEFT JOIN documentos d ON d.id = td.documento_id
       WHERE td.id = ?`
    )
    .get(Number(id));
  if (!row) {return null;}
  if (row.documento_id && !vinculoDocumentoExato(row.modalidade, row.documento_titulo)) {
    row.documento_id = null;
    row.documento_titulo = null;
    row.documento_numero = null;
  }
  return decorarDespesaComFinalidade(row);
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

// ── Agregados para o painel "Pra onde vai o dinheiro" ────────────────────────

function filtroExercicios(exercicios) {
  const lista = (exercicios || []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!lista.length) {return { sql: '1=1', params: [] };}
  return { sql: `exercicio_orcamento IN (${lista.map(() => '?').join(', ')})`, params: lista };
}

function filtroCategoria(prefixos) {
  if (!prefixos?.length) {return { sql: '1=1', params: [] };}
  return prefixosWhere(prefixos);
}

function getAgregadoPorCategoriaEconomica({ exercicios } = {}) {
  const ex = filtroExercicios(exercicios);
  return db
    .prepare(
      `SELECT categoria_economica, COUNT(*) AS n, ROUND(SUM(valor), 2) AS valor_total
       FROM transparencia_despesas WHERE ${ex.sql}
       GROUP BY categoria_economica ORDER BY valor_total DESC`
    )
    .all(...ex.params);
}

function getAgregadoPorUnidade({ exercicios, prefixos } = {}) {
  const ex = filtroExercicios(exercicios);
  const cat = filtroCategoria(prefixos);
  return db
    .prepare(
      `SELECT unidade, COUNT(*) AS n, ROUND(SUM(valor), 2) AS valor_total
       FROM transparencia_despesas WHERE ${ex.sql} AND ${cat.sql}
       GROUP BY unidade ORDER BY valor_total DESC`
    )
    .all(...ex.params, ...cat.params);
}

function getAgregadoPorFonteRecurso({ exercicios, prefixos } = {}) {
  const ex = filtroExercicios(exercicios);
  const cat = filtroCategoria(prefixos);
  return db
    .prepare(
      `SELECT fonte_recurso, COUNT(*) AS n, ROUND(SUM(valor), 2) AS valor_total
       FROM transparencia_despesas WHERE ${ex.sql} AND ${cat.sql}
       GROUP BY fonte_recurso ORDER BY valor_total DESC`
    )
    .all(...ex.params, ...cat.params);
}

function getRankingCredores({ prefixos, exercicios, limite = 15 } = {}) {
  const ex = filtroExercicios(exercicios);
  const cat = filtroCategoria(prefixos);
  // Agrupa por credor_chave (CNPJ ou pf-slug) — une grafias do mesmo nome PF.
  // MAX(credor_cargo) pode trazer cargo antigo se a pessoa mudou de cargo;
  // aceito (a alternativa exigiria subquery pelo empenho mais recente).
  return db
    .prepare(
      `SELECT credor_nome, credor_cnpj, credor_chave,
              MAX(credor_cargo) AS credor_cargo,
              COUNT(*) AS n, ROUND(SUM(valor), 2) AS valor_total
       FROM transparencia_despesas
       WHERE ${ex.sql} AND ${cat.sql} AND credor_nome IS NOT NULL
       GROUP BY COALESCE(credor_chave, credor_nome)
       ORDER BY valor_total DESC LIMIT ?`
    )
    .all(...ex.params, ...cat.params, Number(limite));
}

function getCategoriaPorAno({ prefixos } = {}) {
  const cat = filtroCategoria(prefixos);
  return db
    .prepare(
      `SELECT exercicio_orcamento AS exercicio, COUNT(*) AS n, ROUND(SUM(valor), 2) AS valor_total
       FROM transparencia_despesas WHERE ${cat.sql}
       GROUP BY exercicio_orcamento ORDER BY exercicio_orcamento ASC`
    )
    .all(...cat.params);
}

/**
 * Agregado por (categoria bruta, exercício, credor) com ids dos empenhos —
 * insumo do detector de gasto atípico. Classificação cidadã fica no chamador.
 */
function getAgregadoCredorCategoriaAno() {
  return db
    .prepare(
      `SELECT categoria_economica, exercicio_orcamento AS exercicio,
              credor_cnpj, credor_nome,
              COUNT(*) AS n, ROUND(SUM(valor), 2) AS valor_total,
              GROUP_CONCAT(id) AS ids
       FROM transparencia_despesas
       WHERE credor_nome IS NOT NULL
       GROUP BY categoria_economica, exercicio_orcamento, COALESCE(credor_cnpj, credor_nome)`
    )
    .all()
    .map((row) => ({
      ...row,
      empenho_ids: String(row.ids || '')
        .split(',')
        .filter(Boolean)
        .map(Number),
      ids: undefined,
    }));
}

function getDespesasPorIds(ids) {
  const lista = (ids || []).map(Number).filter(Number.isInteger);
  if (!lista.length) {return [];}
  return db
    .prepare(
      `SELECT id, empenho, exercicio_orcamento, tipo, valor, data_empenho, historico, credor_nome
       FROM transparencia_despesas WHERE id IN (${lista.map(() => '?').join(', ')})
       ORDER BY valor DESC`
    )
    .all(...lista);
}

module.exports = {
  getDespesaById,
  getResumoRelacionados,
  getResumoCategoriaAno,
  getAgregadoPorCategoriaEconomica,
  getAgregadoPorUnidade,
  getAgregadoPorFonteRecurso,
  getRankingCredores,
  getCategoriaPorAno,
  getAgregadoCredorCategoriaAno,
  getDespesasPorIds,
};
