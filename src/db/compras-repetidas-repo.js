'use strict';

/**
 * Leituras para a vertente "compras repetidas": empenhos originais com data e CNPJ, e os CNPJs
 * que aparecem como vencedor/fornecedor em licitações, contratos e atas do acervo. Só queries;
 * a regra fica em src/alertas/vertentes/compras-repetidas.js.
 */

const { db } = require('./connection');

const SO_DIGITOS =
  "REPLACE(REPLACE(REPLACE(REPLACE(TRIM(%s), '.', ''), '/', ''), '-', ''), ' ', '')";
const digitos = coluna => SO_DIGITOS.replace('%s', coluna);

function listarEmpenhosOriginais() {
  return db
    .prepare(
      `SELECT id, empenho, credor_nome, credor_cnpj, valor, tipo, historico,
              exercicio_orcamento, data_empenho
         FROM transparencia_despesas
        WHERE tipo LIKE 'EO%' AND data_empenho IS NOT NULL AND valor > 0
          AND credor_cnpj IS NOT NULL AND TRIM(credor_cnpj) <> ''`
    )
    .all();
}

function listarCnpjsComInstrumento() {
  const linhas = db
    .prepare(
      `SELECT ${digitos('vencedor_cnpj')} AS cnpj FROM licitacoes_detalhes
        WHERE vencedor_cnpj IS NOT NULL
       UNION
       SELECT ${digitos('fornecedor_cnpj')} AS cnpj FROM licitacoes_produtos
        WHERE fornecedor_cnpj IS NOT NULL`
    )
    .all();
  return new Set(linhas.map(l => l.cnpj).filter(Boolean));
}

function listarTitulosDeProcessos() {
  return db
    .prepare("SELECT titulo FROM documentos WHERE titulo LIKE 'Processo %'")
    .all()
    .map(l => l.titulo);
}

module.exports = { listarEmpenhosOriginais, listarCnpjsComInstrumento, listarTitulosDeProcessos };
