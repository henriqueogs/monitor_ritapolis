'use strict';

// CommonJS de propósito (mesmo padrão de lib/fetch-retry.js): testável pelo Jest da raiz.
//
// CLAUDE.md §11.1: soma de valores de vários anos sempre leva o intervalo no rótulo.

function rotuloIntervaloAnos(min, max) {
  if (!min || !max) {return '';}
  return min === max ? String(min) : `${min}–${max}`;
}

// Junta ano_min_<campo>/ano_max_<campo> de várias linhas (ex.: categorias) num só intervalo.
function intervaloDasLinhas(linhas = [], campo) {
  let min = null;
  let max = null;
  for (const linha of linhas) {
    const a = linha[`ano_min_${campo}`];
    const b = linha[`ano_max_${campo}`];
    if (a && (min === null || a < min)) {min = a;}
    if (b && (max === null || b > max)) {max = b;}
  }
  return { min, max };
}

module.exports = { rotuloIntervaloAnos, intervaloDasLinhas };
