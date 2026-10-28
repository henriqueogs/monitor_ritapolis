'use strict';

// Regras puras para transformar itens/resultados do PNCP no vencedor e no valor
// final homologado de uma compra (licitacoes_detalhes). Sem I/O: o cliente HTTP
// fica em src/integracoes/pncp-orgaos.js e a orquestração em src/coletas/pncp-vencedores.js.

// Formato "<CNPJ do órgão, 14 dígitos>-1-<sequencial, 6 dígitos>/<ano>": o 1 indica compra.
const RE_CONTROLE_COMPRA = /^(\d{14})-1-(\d{6})\/(\d{4})$/;

// situacaoCompraItem do PNCP: 3 (anulado/revogado/cancelado), 4 (deserto) e
// 5 (fracassado) encerram o item sem fornecedor.
const ITEM_ENCERRADO_SEM_RESULTADO = new Set([3, 4, 5]);
// situacaoCompraItemResultadoId: 2 = resultado cancelado (não vale como homologado).
const RESULTADO_CANCELADO = 2;
// Registro de preços: só o 1º classificado é o adjudicado; 2º, 3º e cadastro
// reserva também vêm como resultado do item e não podem somar.
const PRIMEIRO_CLASSIFICADO = 1;
const FONTE_PNCP = 'pncp';

function parseControleCompra(controle) {
  const m = RE_CONTROLE_COMPRA.exec(String(controle || '').trim());
  if (!m) {return null;}
  return { cnpj: m[1], ano: Number(m[3]), sequencial: Number(m[2]) };
}

function apenasDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

// Número oficial ou null: '' e texto não numérico são desconhecidos, nunca zero.
function numeroOficial(valor) {
  if (typeof valor === 'number') {return Number.isFinite(valor) ? valor : null;}
  if (typeof valor !== 'string' || valor.trim() === '') {return null;}
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

// Resultados que contam como adjudicação do item.
function resultadosVencedores(item) {
  return (item.resultados || []).filter((r) => {
    if (Number(r.situacaoCompraItemResultadoId) === RESULTADO_CANCELADO) {return false;}
    if (!apenasDigitos(r.niFornecedor)) {return false;}
    const ordem = r.ordemClassificacaoSrp;
    return ordem === null || ordem === undefined || Number(ordem) === PRIMEIRO_CLASSIFICADO;
  });
}

// Fechado = tem adjudicação ou o PNCP encerrou o item sem fornecedor. temResultado
// sem resultado válido (lista vazia, só cancelado) fica pendente.
function itemFechado(item, vencedores) {
  return vencedores.length > 0 || ITEM_ENCERRADO_SEM_RESULTADO.has(Number(item.situacaoCompraItem));
}

// Valor homologado do item, ou null se não dá para afirmar o total sem dupla contagem.
function valorDoItem(item, vencedores) {
  const valores = vencedores.map((r) => numeroOficial(r.valorTotalHomologado));
  if (valores.some((v) => v === null)) {return null;}
  if (vencedores.length > 1) {
    // Item dividido entre fornecedores: só soma se as quantidades cabem no item.
    const quantidades = vencedores.map((r) => numeroOficial(r.quantidadeHomologada));
    const quantidadeItem = numeroOficial(item.quantidade);
    if (quantidadeItem === null || quantidades.some((q) => q === null)) {return null;}
    if (quantidades.reduce((a, b) => a + b, 0) > quantidadeItem + 1e-9) {return null;}
  }
  return valores.reduce((a, b) => a + b, 0);
}

/**
 * Consolida os resultados de todos os itens de uma compra.
 * - Só grava algo quando a compra está fechada (nenhum item pendente).
 * - Vencedor só quando um único fornecedor (CNPJ) venceu todos os itens adjudicados.
 * - valor_final = soma do valor homologado dos adjudicados; null se algum é desconhecido
 *   ou se um item dividido não fecha a quantidade.
 */
function consolidarResultadosCompra(itens = []) {
  const fornecedores = new Map();
  let soma = 0;
  let somaCompleta = true;
  let dataResultado = null;
  let itensComResultado = 0;
  let fechada = itens.length > 0;

  for (const item of itens) {
    const vencedores = resultadosVencedores(item);
    if (!itemFechado(item, vencedores)) {fechada = false;}
    if (!vencedores.length) {continue;}
    itensComResultado += 1;
    const valor = valorDoItem(item, vencedores);
    if (valor === null) {somaCompleta = false;} else {soma += valor;}
    for (const r of vencedores) {
      const cnpj = apenasDigitos(r.niFornecedor);
      if (!fornecedores.has(cnpj)) {fornecedores.set(cnpj, r.nomeRazaoSocialFornecedor || null);}
      const data = String(r.dataResultado || '').slice(0, 10) || null;
      if (data && (!dataResultado || data > dataResultado)) {dataResultado = data;}
    }
  }

  const gravavel = fechada && itensComResultado > 0;
  const unico = gravavel && fornecedores.size === 1 ? [...fornecedores.entries()][0] : null;
  return {
    vencedor_nome: unico ? unico[1] : null,
    vencedor_cnpj: unico ? unico[0] : null,
    valor_final: gravavel && somaCompleta ? Math.round(soma * 100) / 100 : null,
    data_resultado: gravavel ? dataResultado : null,
    itens: itens.length,
    itens_com_resultado: itensComResultado,
    fornecedores: fornecedores.size,
  };
}

/**
 * Um processo pode ter mais de um documento com o mesmo numero_pncp (edital do site
 * e a compra trazida pelo coletor do PNCP). O resultado vai para um só, senão os
 * agregados por ano somam o processo duas vezes: o documento local, de menor id;
 * sem documento local, o do PNCP.
 */
function escolherDocumentoCanonico(documentos = []) {
  if (!documentos.length) {return null;}
  return [...documentos].sort(
    (a, b) => Number(a.fonte === FONTE_PNCP) - Number(b.fonte === FONTE_PNCP) || a.id - b.id
  )[0];
}

module.exports = { parseControleCompra, consolidarResultadosCompra, escolherDocumentoCanonico };
