'use strict';

// Faixa de plausibilidade para valores finais homologados de uma licitação
// municipal de pequeno porte (Ritápolis). Valores fora dela quase sempre são
// artefatos de parsing — um número capturado da prosa do PDF (ex.: "60 dias",
// número de artigo) ou uma soma indevida. Nesses casos o valor é descartado e
// o campo passa a ser exibido como "não verificado" (lacuna explícita).
const PISO_VALOR_PLAUSIVEL = 100;
const TETO_VALOR_PLAUSIVEL = 100000000; // R$ 100 milhões

/**
 * Avalia se um valor final é plausível para uma licitação municipal.
 * Valores nulos/zero são tratados como "não aplicável" (já são lacuna) e
 * retornam plausível — não há o que invalidar. Valores não-numéricos idem.
 *
 * @param {number|null} valor
 * @param {{ piso?: number, teto?: number }} [opcoes]
 * @returns {{ plausivel: boolean, motivo: string|null }}
 */
function avaliarValorFinal(valor, { piso = PISO_VALOR_PLAUSIVEL, teto = TETO_VALOR_PLAUSIVEL } = {}) {
  if (valor === null || valor === undefined || valor === 0) {
    return { plausivel: true, motivo: null };
  }

  const numero = Number(valor);
  if (!Number.isFinite(numero)) {
    return { plausivel: true, motivo: null };
  }

  if (numero < piso) {
    return { plausivel: false, motivo: 'abaixo_do_piso' };
  }

  if (numero > teto) {
    return { plausivel: false, motivo: 'acima_do_teto' };
  }

  return { plausivel: true, motivo: null };
}

// Um item não pode custar mais que o processo inteiro; 5% de folga cobre
// arredondamento entre fontes (ata vs portal de transparência).
const FATOR_MAX_ITEM_VS_PROCESSO = 1.05;

function roundMoney(value) {
  const numero = Number(value);
  return Number.isFinite(numero) ? Math.round(numero * 100) / 100 : null;
}

function positivo(value) {
  const numero = Number(value);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

/**
 * Valor final estruturado de um produto, na MESMA prioridade da exibição
 * pública (LicitationProducts): total do item > lote > global >
 * unitário×quantidade > unitário. O gate protege o que o cidadão vê —
 * a ordem tem que ser idêntica à da UI.
 * @returns {{ campo: string, tipo: string, valor: number }|null}
 */
function extrairValorFinalEstruturado(produto = {}) {
  const total = positivo(produto.valor_total_final);
  if (total) {return { campo: 'valor_total_final', tipo: 'total_item', valor: total };}

  const lote = positivo(produto.valor_lote_final);
  if (lote) {return { campo: 'valor_lote_final', tipo: 'lote', valor: lote };}

  const global = positivo(produto.valor_global_final);
  if (global) {return { campo: 'valor_global_final', tipo: 'global', valor: global };}

  const unitario = positivo(produto.valor_unitario_final);
  const quantidade = positivo(produto.quantidade);
  if (unitario && quantidade) {
    return {
      campo: 'valor_total_final_calculado',
      tipo: 'total_item',
      valor: roundMoney(unitario * quantidade),
    };
  }
  if (unitario) {return { campo: 'valor_unitario_final', tipo: 'unitario', valor: unitario };}
  return null;
}

/**
 * Gate de plausibilidade item×processo: item não pode exceder o valor final
 * do processo. Sem valor de referência (null/0) → plausível: lacuna explícita,
 * nunca inventa julgamento.
 * @returns {{ plausivel: boolean, motivo: string|null, razao: number|null }}
 */
function avaliarValorItemContraProcesso({
  valorItem,
  valorFinalProcesso,
  fator = FATOR_MAX_ITEM_VS_PROCESSO,
} = {}) {
  const item = positivo(valorItem);
  const processo = positivo(valorFinalProcesso);
  if (!item || !processo) {return { plausivel: true, motivo: null, razao: null };}

  const razao = item / processo;
  if (razao > fator) {
    return {
      plausivel: false,
      motivo: 'item_excede_valor_processo',
      razao: Math.round(razao * 100) / 100,
    };
  }
  return { plausivel: true, motivo: null, razao: Math.round(razao * 100) / 100 };
}

module.exports = {
  avaliarValorFinal,
  extrairValorFinalEstruturado,
  avaliarValorItemContraProcesso,
  FATOR_MAX_ITEM_VS_PROCESSO,
  PISO_VALOR_PLAUSIVEL,
  TETO_VALOR_PLAUSIVEL,
};
