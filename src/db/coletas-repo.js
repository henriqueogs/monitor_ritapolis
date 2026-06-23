'use strict';

/**
 * Repositório de coletas — logs de execução dos coletores.
 * Tabelas: coletas_log
 */

const { db } = require('./connection');

// Utilitário local (evita import circular com index.js)
function _parseJson(value) {
  if (!value) { return null; }
  try { return JSON.parse(value); } catch { return null; }
}

function _serializeJson(value) {
  return value === null ? null : JSON.stringify(value);
}

/**
 * Cria um novo log de coleta. Marca coletas em andamento anteriores como erro_total.
 * @param {{ fonte: string, inicio: string }} param0
 * @returns {number} id do log criado
 */
function createColetaLog({ fonte, inicio }) {
  db.prepare(
    `UPDATE coletas_log
     SET status = 'erro_total',
         fim = COALESCE(fim, CURRENT_TIMESTAMP),
         detalhes = json_object('motivo', 'execucao_interrompida')
     WHERE fonte = ?
       AND status = 'em_andamento'`
  ).run(fonte);

  const result = db
    .prepare('INSERT INTO coletas_log (fonte, inicio, status, detalhes) VALUES (?, ?, ?, ?)')
    .run(fonte, inicio, 'em_andamento', null);
  return result.lastInsertRowid;
}

/**
 * Finaliza um log de coleta com os resultados.
 * @param {number} id
 * @param {{ fim, status, itens_novos, itens_atualizados, itens_com_erro, detalhes }} data
 */
function finishColetaLog(id, data) {
  db.prepare(
    `UPDATE coletas_log SET
      fim = @fim,
      status = @status,
      itens_novos = @itens_novos,
      itens_atualizados = @itens_atualizados,
      itens_com_erro = @itens_com_erro,
      detalhes = @detalhes
    WHERE id = @id`
  ).run({
    id,
    fim: data.fim,
    status: data.status,
    itens_novos: data.itens_novos || 0,
    itens_atualizados: data.itens_atualizados || 0,
    itens_com_erro: data.itens_com_erro || 0,
    detalhes: _serializeJson(data.detalhes || null)
  });
}

/**
 * Lista os logs de coleta mais recentes.
 * @param {number} limite
 * @returns {Array}
 */
function listColetasLog(limite = 10) {
  return db
    .prepare('SELECT * FROM coletas_log ORDER BY id DESC LIMIT ?')
    .all(limite)
    .map((item) => ({ ...item, detalhes: _parseJson(item.detalhes) }));
}

module.exports = {
  createColetaLog,
  finishColetaLog,
  listColetasLog,
};
