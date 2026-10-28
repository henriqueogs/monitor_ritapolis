'use strict';

// Regras puras para transformar itens/resultados do PNCP no vencedor e no valor
// final homologado de uma compra (licitacoes_detalhes). Sem I/O: o cliente HTTP
// fica em src/integracoes/pncp-orgaos.js e a orquestração em src/coletas/pncp-vencedores.js.

// Formato "<CNPJ do órgão, 14 dígitos>-1-<sequencial, 6 dígitos>/<ano>": o 1 indica compra.
const RE_CONTROLE_COMPRA = /^(\d{14})-1-(\d{6})\/(\d{4})$/;

// situacaoCompraItem do PNCP: 1 = em andamento. 3 (anulado/revogado/cancelado),
// 4 (deserto) e 5 (fracassado) encerram o item sem fornecedor.
const ITEM_ENCERRADO_SEM_RESULTADO = new Set([3, 4, 5]);
// situacaoCompraItemResultadoId: 2 = resultado cancelado (não vale como homologado).
const RESULTADO_CANCELADO = 2;

function parseControleCompra(controle) {
  const m = RE_CONTROLE_COMPRA.exec(String(controle || '').trim());
  if (!m) {return null;}
  return { cnpj: m[1], ano: Number(m[3]), sequencial: Number(m[2]) };
}

function apenasDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function resultadosValidos(item) {
  return (item.resultados || []).filter(
    (r) => Number(r.situacaoCompraItemResultadoId) !== RESULTADO_CANCELADO && apenasDigitos(r.niFornecedor)
  );
}

function itemFechado(item, validos) {
  if (validos.length > 0 || item.temResultado) {return true;}
  // Sem resultado: só conta como fechado se o PNCP disser que encerrou sem fornecedor.
  // Situação desconhecida ou em andamento é tratada como pendente (conservador).
  return ITEM_ENCERRADO_SEM_RESULTADO.has(Number(item.situacaoCompraItem));
}

/**
 * Consolida os resultados de todos os itens de uma compra.
 * - Só grava algo quando a compra está fechada (nenhum item em andamento).
 * - Vencedor só quando um único fornecedor (CNPJ) venceu todos os itens com resultado.
 * - valor_final = soma do valorTotalHomologado; null se algum resultado não tem valor
 *   (valor desconhecido é null, nunca zero).
 */
function consolidarResultadosCompra(itens = []) {
  const fornecedores = new Map();
  let soma = 0;
  let somaCompleta = true;
  let dataResultado = null;
  let itensComResultado = 0;
  let fechada = itens.length > 0;

  for (const item of itens) {
    const validos = resultadosValidos(item);
    if (!itemFechado(item, validos)) {fechada = false;}
    if (validos.length) {itensComResultado += 1;}
    for (const r of validos) {
      const cnpj = apenasDigitos(r.niFornecedor);
      if (!fornecedores.has(cnpj)) {fornecedores.set(cnpj, r.nomeRazaoSocialFornecedor || null);}
      const valor = Number(r.valorTotalHomologado);
      if (r.valorTotalHomologado === null || r.valorTotalHomologado === undefined || !Number.isFinite(valor)) {
        somaCompleta = false;
      } else {
        soma += valor;
      }
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

module.exports = { parseControleCompra, consolidarResultadosCompra };
