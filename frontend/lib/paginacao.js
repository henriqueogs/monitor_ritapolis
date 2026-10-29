'use strict';

// CommonJS de propósito (mesmo padrão de lib/intervalo-anos.js): testável pelo Jest da raiz.
//
// Converte ?pagina=&limite= da URL em offset para APIs paginadas por offset (ex.: /api/emendas).

function inteiroPositivo(valor, padrao) {
  const n = Math.trunc(Number(valor));
  return Number.isFinite(n) && n >= 1 ? n : padrao;
}

function paginacaoDaBusca({ pagina, limite } = {}, { limite: limitePadrao, limiteMax = limitePadrao } = {}) {
  const paginaAtual = inteiroPositivo(pagina, 1);
  const tamanho = Math.min(inteiroPositivo(limite, limitePadrao), limiteMax);
  return { pagina: paginaAtual, limite: tamanho, offset: (paginaAtual - 1) * tamanho };
}

module.exports = { paginacaoDaBusca };
