'use strict';

/**
 * Leitura e gravação mínimas para o backfill de licitação/modalidade dos empenhos já coletados
 * (campos que o detalhe da despesa traz e o coletor só passou a ler no PR #240). Grava apenas
 * licitacao_ref e modalidade, e só onde os dois ainda estão vazios.
 */

const { db } = require('./connection');

const SO_DIGITOS =
  "REPLACE(REPLACE(REPLACE(REPLACE(TRIM(credor_cnpj), '.', ''), '/', ''), '-', ''), ' ', '')";
const SEM_LIMITE = -1;

function listarSemModalidade({ anoMin = 0, cnpj = null, limite = SEM_LIMITE } = {}) {
  const alvo = cnpj ? String(cnpj).replace(/\D/g, '') : null;
  return db
    .prepare(
      `SELECT id, empenho, exercicio_orcamento, tipo
         FROM transparencia_despesas
        WHERE tipo LIKE 'EO%' AND exercicio_orcamento >= ?
          AND (licitacao_ref IS NULL OR TRIM(licitacao_ref) = '')
          AND (modalidade IS NULL OR TRIM(modalidade) = '')
          AND (? IS NULL OR ${SO_DIGITOS} = ?)
        ORDER BY exercicio_orcamento DESC, id
        LIMIT ?`
    )
    .all(anoMin, alvo, alvo, limite);
}

function gravarLicitacaoModalidade(id, licitacao, modalidade) {
  const r = db
    .prepare(
      `UPDATE transparencia_despesas
          SET licitacao_ref = ?, modalidade = ?
        WHERE id = ?
          AND (licitacao_ref IS NULL OR TRIM(licitacao_ref) = '')
          AND (modalidade IS NULL OR TRIM(modalidade) = '')`
    )
    .run(licitacao || null, modalidade || null, id);
  return r.changes > 0;
}

module.exports = { listarSemModalidade, gravarLicitacaoModalidade };
