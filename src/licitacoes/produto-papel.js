'use strict';

/**
 * Papel de cada linha de licitacoes_produtos na seção "Itens do processo".
 * A tabela mistura 4 entidades — item do edital (demanda), resultado por lote
 * (teto homologado), resultado global, e lixo de parser. Classificar o papel
 * permite exibir cada uma no bloco certo, sem apresentar teto de lote como item.
 */

const { extrairValorFinalEstruturado } = require('./valores');

const PAPEL = {
  ITEM: 'item',
  RESULTADO_LOTE: 'resultado_lote',
  RESULTADO_GLOBAL: 'resultado_global',
  DESCARTADO: 'descartado',
};

// Marcadores de rodapé/cabeçalho do PDF que vazam pra dentro da descrição.
// Cortamos da descrição pra frente — o produto real fica antes.
const CORTES_RUIDO = [
  /\s*[-–]?\s*e-?mail\s*:.*/i,
  /\s*à\s*vista\s*da\s*habilita.*/i,
  /\s*valor\s*global\s*da\s*proposta.*/i,
  /\s*fornecedor\s+valor.*/i,
  /\s*classifica[çc][aã]o\s+posi[çc][aã]o.*/i,
  /\s*\d+\s+&.*/,
];

function limparDescricaoProduto(descricao) {
  let texto = String(descricao || '').trim();
  if (!texto) {return '';}
  for (const re of CORTES_RUIDO) {
    texto = texto.replace(re, '').trim();
  }
  return texto;
}

/**
 * Lixo = após limpar o rodapé a descrição não tem NENHUMA letra (só número,
 * pontuação ou fragmento de OCR de tabela: "5091", "| 128.90", "1.54%"). Um
 * valor solto sem descrição é artefato de parse, não item exibível.
 * Conservador de propósito: produto abreviado ("CD-RW", "R22", "7 MM") e
 * descrição curta ("NOBREAK") NÃO são lixo — perder item real é pior que
 * mostrar uma linha-ruído rara.
 * @returns {{ lixo: boolean, motivo: string|null }}
 */
function detectarLixoProduto(produto = {}) {
  const limpa = limparDescricaoProduto(produto.descricao);
  if (/[A-Za-zÀ-ÿ]/.test(limpa)) {return { lixo: false, motivo: null };}

  const original = String(produto.descricao || '').trim();
  if (original && original !== limpa) {return { lixo: true, motivo: 'ruido_parser' };}
  return { lixo: true, motivo: 'sem_conteudo' };
}

/**
 * @returns {'item'|'resultado_lote'|'resultado_global'|'descartado'}
 */
function classificarPapelProduto(produto = {}) {
  if (detectarLixoProduto(produto).lixo) {return PAPEL.DESCARTADO;}

  const estruturado = extrairValorFinalEstruturado(produto);
  if (produto.valor_final_tipo === 'global' || produto.valor_global_final) {return PAPEL.RESULTADO_GLOBAL;}
  if (produto.valor_final_tipo === 'lote' || produto.valor_lote_final) {return PAPEL.RESULTADO_LOTE;}
  if (estruturado?.tipo === 'global') {return PAPEL.RESULTADO_GLOBAL;}
  if (estruturado?.tipo === 'lote') {return PAPEL.RESULTADO_LOTE;}
  return PAPEL.ITEM;
}

module.exports = {
  PAPEL,
  limparDescricaoProduto,
  detectarLixoProduto,
  classificarPapelProduto,
};
