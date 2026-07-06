'use strict';

/**
 * Monta a visão estruturada da seção "Itens do processo" a partir das linhas
 * planas de licitacoes_produtos, roteando cada uma pelo seu papel real:
 *   ① itens_solicitados  — demanda do edital (com resultado por item quando houver)
 *   ② resultado_lotes     — teto homologado por lote + vencedor
 *   ③ resultado_global    — valor único do processo
 *   ▸ descartados         — lixo de parser, colapsado
 * Colapsa duplicatas (ia_resumo × ata) preferindo a linha mais rica.
 */

const { classificarPapelProduto, limparDescricaoProduto, detectarLixoProduto } = require('./produto-papel');

function presente(valor) {
  return valor !== null && valor !== undefined;
}

function descNorm(produto) {
  return produto.descricao_normalizada || limparDescricaoProduto(produto.descricao).toLowerCase();
}

// Chave de duplicata por bucket. Itens: item + descrição. Lotes: número do
// lote quando existe (a ata terse e o resumo IA verboso descrevem o mesmo
// lote com textos diferentes — o número é o único elo confiável).
function chaveItem(p) {
  return `${p.item_numero ?? ''}|${descNorm(p)}`;
}
function chaveLote(p) {
  return p.lote_numero ? `L${p.lote_numero}` : `D${descNorm(p)}`;
}

// Riqueza da linha — na hora de colapsar duplicata, a mais rica vence.
function riqueza(produto) {
  let score = 0;
  if (produto.fornecedor_nome) {score += 4;}
  if (produto.valor_lote_final || produto.valor_total_final || produto.valor_unitario_final || produto.valor_global_final) {score += 3;}
  if (String(produto.origem || '').includes('ata_resultado')) {score += 2;}
  if (produto.quantidade) {score += 1;}
  return score;
}

function colapsar(produtos, chaveFn) {
  const porChave = new Map();
  for (const p of produtos) {
    const chave = chaveFn(p);
    const atual = porChave.get(chave);
    if (!atual || riqueza(p) > riqueza(atual)) {porChave.set(chave, p);}
  }
  return [...porChave.values()];
}

function ordenarPor(campo) {
  return (a, b) => {
    const na = Number(a[campo]);
    const nb = Number(b[campo]);
    if (Number.isFinite(na) && Number.isFinite(nb)) {return na - nb;}
    return String(a[campo] ?? '').localeCompare(String(b[campo] ?? ''));
  };
}

function montarItemSolicitado(p) {
  const temResultadoItem =
    (presente(p.valor_unitario_final) || presente(p.valor_total_final)) &&
    p.valor_final_tipo !== 'lote' &&
    p.valor_final_tipo !== 'global';
  return {
    id: p.id,
    item_numero: p.item_numero,
    descricao: limparDescricaoProduto(p.descricao),
    quantidade: p.quantidade,
    unidade: p.unidade,
    valor_estimado: p.valor_total_estimado ?? (presente(p.valor_unitario_estimado) && presente(p.quantidade) ? p.valor_unitario_estimado * p.quantidade : p.valor_unitario_estimado),
    resultado_item: temResultadoItem
      ? { valor: p.valor_total_final ?? p.valor_unitario_final, fornecedor_nome: p.fornecedor_nome, unitario: p.valor_unitario_final }
      : null,
    grupo_id: p.grupo_id,
    anexo_origem_id: p.anexo_origem_id,
  };
}

function montarResultadoLote(p) {
  return {
    id: p.id,
    lote_numero: p.lote_numero,
    objeto: limparDescricaoProduto(p.descricao),
    fornecedor_nome: p.fornecedor_nome,
    fornecedor_cnpj: p.fornecedor_cnpj,
    teto_homologado: p.valor_lote_final,
    contexto_empenho: Boolean(p.valor_final_contexto_empenho),
    quarentenado: Boolean(p.valor_final_quarentenado),
    empenhado: p.plausibilidade_valor_processo,
    anexo_origem_id: p.anexo_origem_id,
  };
}

function montarResultadoGlobal(p) {
  return {
    id: p.id,
    descricao: limparDescricaoProduto(p.descricao),
    valor: p.valor_global_final,
    fornecedor_nome: p.fornecedor_nome,
    fornecedor_cnpj: p.fornecedor_cnpj,
    anexo_origem_id: p.anexo_origem_id,
  };
}

function montarItensProcesso(produtos, { valorFinalProcesso = null, valorFinalOrigem = null } = {}) {
  const lista = Array.isArray(produtos) ? produtos : [];
  const buckets = { item: [], resultado_lote: [], resultado_global: [], descartado: [] };
  for (const p of lista) {
    buckets[classificarPapelProduto(p)].push(p);
  }

  const itens_solicitados = colapsar(buckets.item, chaveItem).map(montarItemSolicitado).sort(ordenarPor('item_numero'));
  const resultado_lotes = colapsar(buckets.resultado_lote, chaveLote).map(montarResultadoLote).sort(ordenarPor('lote_numero'));
  const globalRaw = colapsar(buckets.resultado_global, descNorm);
  const resultado_global = globalRaw.length ? montarResultadoGlobal(globalRaw[0]) : null;
  const descartados = buckets.descartado.map((p) => ({
    id: p.id,
    descricao: String(p.descricao || '').slice(0, 80),
    motivo: detectarLixoProduto(p).motivo,
  }));

  const tem_resultado = resultado_lotes.length > 0 || Boolean(resultado_global) ||
    itens_solicitados.some((i) => i.resultado_item);

  return {
    itens_solicitados,
    resultado_lotes,
    resultado_global,
    descartados,
    cobertura: {
      n_itens: itens_solicitados.length,
      n_lotes: resultado_lotes.length,
      n_descartados: descartados.length,
      tem_resultado,
      so_demanda: itens_solicitados.length > 0 && !tem_resultado,
      valor_final_processo: valorFinalProcesso,
      valor_final_origem: valorFinalOrigem,
    },
  };
}

// Mesmo shape de saída de montarItensProcesso, mas a partir do resultado da
// reextração via IA (contrato itens-processo-v1.0) — usado quando existe
// documentos_itens_estruturados com confiança aceitável (Fase G). Sem
// `descartados` (a IA já filtra lixo na origem) nem `id`/`grupo_id`/
// `anexo_origem_id` (não existem nesse pipeline); `trecho_fonte` some no
// lugar como origem rastreável (§11.3).
function montarItemSolicitadoIA(item) {
  return {
    item_numero: item.item_numero ?? null,
    descricao: item.descricao,
    quantidade: item.quantidade ?? null,
    unidade: item.unidade ?? null,
    valor_estimado: item.valor_estimado ?? null,
    resultado_item: null,
    trecho_fonte: item.trecho_fonte,
  };
}

function montarResultadoLoteIA(lote) {
  return {
    lote_numero: lote.lote_numero ?? null,
    objeto: lote.objeto,
    fornecedor_nome: lote.fornecedor_nome ?? null,
    fornecedor_cnpj: lote.fornecedor_cnpj ?? null,
    teto_homologado: lote.teto_homologado ?? null,
    trecho_fonte: lote.trecho_fonte,
  };
}

function montarResultadoGlobalIA(global) {
  if (!global) {return null;}
  return {
    descricao: global.descricao,
    valor: global.valor ?? null,
    fornecedor_nome: global.fornecedor_nome ?? null,
    fornecedor_cnpj: global.fornecedor_cnpj ?? null,
    trecho_fonte: global.trecho_fonte,
  };
}

function montarItensProcessoDeIA(itensJson, { valorFinalProcesso = null, valorFinalOrigem = null } = {}) {
  const itens_solicitados = (itensJson.itens_solicitados || []).map(montarItemSolicitadoIA);
  const resultado_lotes = (itensJson.resultado_lotes || []).map(montarResultadoLoteIA);
  const resultado_global = montarResultadoGlobalIA(itensJson.resultado_global);
  const tem_resultado = resultado_lotes.length > 0 || Boolean(resultado_global);

  return {
    itens_solicitados,
    resultado_lotes,
    resultado_global,
    descartados: [],
    cobertura: {
      n_itens: itens_solicitados.length,
      n_lotes: resultado_lotes.length,
      n_descartados: 0,
      tem_resultado,
      so_demanda: itens_solicitados.length > 0 && !tem_resultado,
      valor_final_processo: valorFinalProcesso,
      valor_final_origem: valorFinalOrigem,
      origem_estrutura: 'ia',
      tem_tabela_itens: itensJson.tem_tabela_itens,
      confianca: itensJson.confianca,
      lacunas: itensJson.lacunas || [],
    },
  };
}

module.exports = { montarItensProcesso, montarItensProcessoDeIA };
