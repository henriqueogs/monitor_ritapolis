'use strict';

// Deriva o vencedor de um processo a partir dos produtos já extraídos (atas de
// resultado). Muitas atas de pregão trazem o vencedor em formato tabular que o
// parser de prosa não captura — mas o pipeline de produtos já extraiu
// fornecedor por item. Esta função promove esse dado ao nível do documento,
// escolhendo o fornecedor dominante (por valor; desempate por nº de itens) e
// sinalizando quando há múltiplos vencedores (pregão por lotes/itens).
//
// Conservadora por design: NÃO calcula valor_final (evita somas indevidas entre
// item/lote/global). Só recupera o nome/CNPJ do vencedor — o que está faltando.

function normalizarCnpj(cnpj) {
  return String(cnpj || '').replace(/\D/g, '');
}

function valorDoProduto(p) {
  return Number(p.valor_total_final || p.valor_lote_final || p.valor_global_final || 0) || 0;
}

function derivarVencedorDeProdutos(produtos) {
  const comFornecedor = (produtos || []).filter(
    (p) => p.fornecedor_nome && normalizarCnpj(p.fornecedor_cnpj).length === 14
  );

  if (comFornecedor.length === 0) {
    return null;
  }

  const porCnpj = new Map();
  for (const p of comFornecedor) {
    const cnpj = normalizarCnpj(p.fornecedor_cnpj);
    // Agrupa por CNPJ normalizado, mas preserva o CNPJ no formato original
    const atual = porCnpj.get(cnpj) || {
      cnpj: p.fornecedor_cnpj,
      nome: p.fornecedor_nome,
      valor: 0,
      itens: 0,
    };
    atual.valor += valorDoProduto(p);
    atual.itens += 1;
    porCnpj.set(cnpj, atual);
  }

  const fornecedores = Array.from(porCnpj.values());
  fornecedores.sort((a, b) => b.valor - a.valor || b.itens - a.itens);
  const dominante = fornecedores[0];

  const nFornecedores = fornecedores.length;
  const multiplos = nFornecedores > 1;
  const trecho = multiplos
    ? `Vencedor derivado dos itens: ${dominante.nome} (dominante entre ${nFornecedores} fornecedores).`
    : `Vencedor derivado dos itens: ${dominante.nome}.`;

  return {
    vencedor_nome: dominante.nome,
    vencedor_cnpj: dominante.cnpj,
    n_fornecedores: nFornecedores,
    multiplos,
    trecho,
  };
}

module.exports = {
  derivarVencedorDeProdutos,
};
