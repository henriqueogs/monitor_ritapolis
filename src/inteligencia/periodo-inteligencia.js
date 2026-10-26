'use strict';

/**
 * Regras de período da análise financeira (domínio puro, sem banco).
 * Nada de ano fixo no repositório: janela e ano de referência saem dos dados e
 * do ano corrente (fiscal-datas D1/D7/D9).
 */

const { ANO_PLAUSIVEL_MIN, ANO_PLAUSIVEL_MAX } = require('../utils/mandato');

// Limiar de dispensa de licitação por regime. A lei exige atualização anual
// (Lei 14.133/2021, art. 182); só os valores abaixo foram conferidos.
// REVISAR: quando o decreto de atualização de um ano novo sair, acrescente o
// regime aqui — `desde` passa a ser o último ano conferido e os anos seguintes
// ficam marcados como `extrapolado` (a UI e o texto de IA avisam).
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

const ULTIMO_ANO_CONFERIDO = Math.max(...REGIMES_LIMIAR_DISPENSA.map((r) => r.desde));

/**
 * Último ano completo (referência do crescimento YoY) e o anterior.
 * O ano em curso nunca é referência (comparar ano parcial com ano cheio engana)
 * e é devolvido em `ano_parcial` para a UI rotular a coluna.
 */
function anosReferenciaYoY({ anosMax, anoAtual = new Date().getFullYear() }) {
  const anoRef = anosMax >= anoAtual ? anosMax - 1 : anosMax;
  return {
    ano_ref: anoRef,
    ano_anterior: anoRef - 1,
    ano_parcial: anosMax === anoAtual ? anosMax : null,
  };
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

/** Limiar do regime vigente no ano; ano inválido usa o mais recente, marcado como extrapolado. */
function limiarDispensa(ano) {
  const anoPlausivel = Number.isInteger(ano) && ano >= ANO_PLAUSIVEL_MIN && ano <= ANO_PLAUSIVEL_MAX;
  const anoValido = anoPlausivel ? ano : Infinity;
  const regime =
    [...REGIMES_LIMIAR_DISPENSA].reverse().find((r) => anoValido >= r.desde) ||
    REGIMES_LIMIAR_DISPENSA[0];
  return { valor: regime.valor, fonte: regime.fonte, extrapolado: anoValido > ULTIMO_ANO_CONFERIDO };
}

/** Valida o ?exercicio= de uma rota. Ausente é válido (usa o padrão dos dados). */
function parseExercicio(raw) {
  if (raw === undefined || raw === null || raw === '') {return { valido: true, valor: undefined };}
  const n = Number(raw);
  const plausivel = Number.isInteger(n) && n >= ANO_PLAUSIVEL_MIN && n <= ANO_PLAUSIVEL_MAX;
  return plausivel ? { valido: true, valor: n } : { valido: false, valor: undefined };
}

module.exports = { anosReferenciaYoY, janelaAnos, limiarDispensa, parseExercicio };
