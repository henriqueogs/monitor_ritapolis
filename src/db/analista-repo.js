'use strict';

/**
 * Leituras para o Analista IA: credores PJ por valor empenhado, empenhos de um credor e os
 * processos licitatórios em que ele aparece como vencedor. Só queries (somente leitura); a
 * regra fica em src/ai/analista/.
 */

const { db } = require('./connection');
const { sqlValorFinalDeEmpenho } = require('../transparencia/valor-final-empenho');

const LIMITE_PADRAO = 20;
const SO_DIGITOS =
  "REPLACE(REPLACE(REPLACE(REPLACE(TRIM(credor_cnpj), '.', ''), '/', ''), '-', ''), ' ', '')";
const SO_DIGITOS_VENCEDOR =
  "REPLACE(REPLACE(REPLACE(REPLACE(TRIM(l.vencedor_cnpj), '.', ''), '/', ''), '-', ''), ' ', '')";

const digitos = valor => String(valor ?? '').replace(/\D/g, '');

function listarCredoresPorValor({ limite = LIMITE_PADRAO, anoMin = 0 } = {}) {
  return db
    .prepare(
      `SELECT ${SO_DIGITOS} AS cnpj, MAX(credor_nome) AS nome, COUNT(*) AS empenhos,
              ROUND(SUM(valor), 2) AS total
         FROM transparencia_despesas
        WHERE tipo LIKE 'EO%' AND exercicio_orcamento >= ? AND LENGTH(${SO_DIGITOS}) = 14
        GROUP BY cnpj ORDER BY total DESC LIMIT ?`
    )
    .all(anoMin, limite);
}

function buscarCredor(cnpj) {
  const alvo = digitos(cnpj);
  const linha = db
    .prepare(`SELECT MAX(credor_nome) AS nome FROM transparencia_despesas WHERE ${SO_DIGITOS} = ?`)
    .get(alvo);
  return linha?.nome ? { nome: linha.nome, cnpj: alvo } : null;
}

function listarEmpenhosDoCredor(cnpj) {
  return db
    .prepare(
      `SELECT id, empenho, exercicio_orcamento, tipo, data_empenho, valor, historico
         FROM transparencia_despesas
        WHERE ${SO_DIGITOS} = ? AND data_empenho IS NOT NULL`
    )
    .all(digitos(cnpj));
}

function listarLicitacoesDoCredor(cnpj) {
  return db
    .prepare(
      `SELECT d.id AS documento_id, d.titulo, d.url_origem, l.vencedor_cnpj, l.valor_final
         FROM licitacoes_detalhes l JOIN documentos d ON d.id = l.documento_id
        WHERE ${SO_DIGITOS_VENCEDOR} = ?
          -- vencedor/valor deduzidos de empenho não são resultado de licitação
          AND NOT ${sqlValorFinalDeEmpenho('l')}
          AND COALESCE(l.origem_detalhe, '') NOT LIKE '%empenho_agregado%'`
    )
    .all(digitos(cnpj));
}

module.exports = {
  listarCredoresPorValor,
  buscarCredor,
  listarEmpenhosDoCredor,
  listarLicitacoesDoCredor,
};
