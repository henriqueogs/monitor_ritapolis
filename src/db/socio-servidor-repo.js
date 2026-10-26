'use strict';

/**
 * Leituras para o detector "sócio que é servidor": QSA das empresas credoras
 * (enriquecimento da Receita), folha por pessoa e ano, e empenhos por credor e
 * ano. Só queries — a regra fica em src/alertas/detectores/socio-servidor.js.
 */

const { db } = require('./connection');

const FONTE_RECEITA = 'receita_cnpj';
const MAX_EMPENHOS_EVIDENCIA = 10;

function lerJson(texto) {
  try {
    return JSON.parse(texto || '{}');
  } catch (err) {
    return { erro_json: err.message };
  }
}

function listarEmpresasComQsa() {
  return db
    .prepare(
      `SELECT credor_chave, dados_json FROM credores_enriquecimentos
        WHERE fonte = ? AND dados_json LIKE '%"qsa"%'`
    )
    .all(FONTE_RECEITA)
    .map((row) => {
      const dados = lerJson(row.dados_json);
      return { cnpj: row.credor_chave, razao_social: dados.razao_social || null, qsa: dados.qsa || [] };
    });
}

function listarFolhaPorAno() {
  return db
    .prepare(
      `SELECT nome_servidor AS nome, cpf_mascarado, competencia_ano AS ano,
              MAX(cargo) AS cargo, MAX(secretaria) AS secretaria, MAX(forma_admissao) AS forma_admissao
         FROM transparencia_folha
        GROUP BY nome_servidor, cpf_mascarado, competencia_ano`
    )
    .all();
}

// Soma por credor e exercício, sem ordem de pagamento (repete o empenho) e
// contando uma vez o empenho recoletado em duas linhas.
function listarEmpenhosPorCredorAno() {
  return db
    .prepare(
      `SELECT credor_cnpj, exercicio_orcamento AS ano, SUM(valor) AS valor, COUNT(*) AS quantidade
         FROM (SELECT DISTINCT credor_cnpj, exercicio_orcamento, empenho, tipo, valor
                 FROM transparencia_despesas
                WHERE length(credor_cnpj) = 14 AND COALESCE(tipo, '') NOT LIKE 'OP%')
        GROUP BY credor_cnpj, exercicio_orcamento`
    )
    .all();
}

function listarMaioresEmpenhos(cnpj, anos) {
  const marcadores = anos.map(() => '?').join(', ');
  return db
    .prepare(
      `SELECT id, empenho, tipo, valor, exercicio_orcamento, credor_nome, historico
         FROM transparencia_despesas
        WHERE credor_cnpj = ? AND exercicio_orcamento IN (${marcadores})
          AND COALESCE(tipo, '') NOT LIKE 'OP%'
        ORDER BY valor DESC
        LIMIT ${MAX_EMPENHOS_EVIDENCIA}`
    )
    .all(cnpj, ...anos);
}

module.exports = {
  listarEmpresasComQsa,
  listarFolhaPorAno,
  listarEmpenhosPorCredorAno,
  listarMaioresEmpenhos,
};
