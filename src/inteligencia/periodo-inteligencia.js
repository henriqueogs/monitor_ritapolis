'use strict';

/**
 * Regras de período da análise financeira (domínio puro, sem banco).
 * Nada de ano fixo no repositório: janela e ano de referência saem dos dados e
 * do ano corrente (fiscal-datas D1/D7/D9).
 */

// Limiar de dispensa de licitação por regime. A lei exige atualização anual
// (Lei 14.133/2021, art. 182); só os valores abaixo foram conferidos.
// REVISAR: quando o decreto de atualização de um ano novo sair, acrescente o
// regime aqui — até lá o ano é marcado como `extrapolado` e a UI avisa.
const REGIMES_LIMIAR_DISPENSA = [
  {
    desde: 0,
    valor: 17600,
    fonte: 'Lei 8.666/1993, art. 24, II (regime anterior)',
  },
  {
    desde: 2024,
    valor: 57900,
    fonte: 'Lei 14.133/2021, art. 75, II, valor atualizado para 2024 (arredondado)',
  },
];

const ULTIMO_ANO_CONFERIDO = 2024;

/**
 * Último ano completo (referência do crescimento YoY) e o anterior.
 * O ano em curso nunca é referência: comparar ano parcial com ano cheio engana.
 */
function anosReferenciaYoY({ anosMax, anoAtual = new Date().getFullYear() }) {
  const anoRef = anosMax >= anoAtual ? anosMax - 1 : anosMax;
  return { ano_ref: anoRef, ano_anterior: anoRef - 1, ano_ref_completo: anoRef < anoAtual };
}

/**
 * Janela de anos da análise: do piso configurado (ou do 1º ano com dados) ao
 * último ano com dados. Sem dados → null (nunca um ano inventado).
 */
function janelaAnos({ anosDisponiveis = [], anoMin }) {
  const anos = anosDisponiveis.filter(Number.isInteger).sort((a, b) => a - b);
  if (!anos.length) {return null;}
  return { anosMin: Math.max(anoMin, anos[0]), anosMax: anos[anos.length - 1] };
}

function limiarDispensa(ano) {
  const regime = [...REGIMES_LIMIAR_DISPENSA].reverse().find((r) => ano >= r.desde);
  return { valor: regime.valor, fonte: regime.fonte, extrapolado: ano > ULTIMO_ANO_CONFERIDO };
}

module.exports = { anosReferenciaYoY, janelaAnos, limiarDispensa };
