'use strict';

// Corrige dados gravados antes do conserto de cleanField(undefined), que devolvia a
// string "undefined". Tabelas derivadas (inteligencia_fatos) herdaram o mesmo lixo.
const LITERAL = 'undefined';
const PREFIXO_DETALHE = `${LITERAL} | `;

const COLUNAS = {
  licitacoes_produtos: ['unidade', 'lote_numero', 'fornecedor_nome', 'fornecedor_cnpj', 'trecho_fonte'],
  inteligencia_fatos: ['unidade', 'trecho_fonte'],
};

function contar(db, tabela, where) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${tabela} WHERE ${where}`).get().n;
}

function limparColuna(db, tabela, coluna, apply) {
  const where = `${coluna} = '${LITERAL}'`;
  const n = contar(db, tabela, where);
  if (apply && n) {
    db.prepare(`UPDATE ${tabela} SET ${coluna} = NULL WHERE ${where}`).run();
  }
  return n;
}

function limparOrigemDetalhe(db, apply) {
  const where = `origem_detalhe = '${LITERAL}' OR origem_detalhe LIKE '${PREFIXO_DETALHE}%'`;
  const n = contar(db, 'licitacoes_produtos', where);
  if (apply && n) {
    db.prepare(
      `UPDATE licitacoes_produtos
       SET origem_detalhe = NULLIF(TRIM(SUBSTR(origem_detalhe, ${PREFIXO_DETALHE.length + 1})), '')
       WHERE ${where}`
    ).run();
  }
  return n;
}

// Retorna quantas linhas/células mudaram (ou mudariam, em dry-run) por tabela.
function limparTextoUndefined(db, { apply = false } = {}) {
  const resumo = {};
  for (const [tabela, colunas] of Object.entries(COLUNAS)) {
    resumo[tabela] = colunas.reduce((soma, coluna) => soma + limparColuna(db, tabela, coluna, apply), 0);
  }
  resumo.licitacoes_produtos += limparOrigemDetalhe(db, apply);
  return resumo;
}

module.exports = { limparTextoUndefined };
