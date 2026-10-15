'use strict';

/**
 * Reciprocal Rank Fusion (ADR 0003): funde rankings de ramos (vetor, lexical) sem calibrar pesos.
 * score = Σ 1/(k + posição), posição começando em 1. Função pura.
 */

const RRF_K = 60;

/** ramos: { nome, itens: { id, ... }[] }[] → itens com { scoreRrf, ramos }, melhor primeiro. */
function fundirRRF(ramos, { k = RRF_K, limite } = {}) {
  const fundidos = new Map();
  for (const { nome, itens } of ramos) {
    const vistos = new Set();
    itens.forEach((item, indice) => {
      if (vistos.has(item.id)) {
        return;
      }
      vistos.add(item.id);
      const atual = fundidos.get(item.id) ?? { ...item, scoreRrf: 0, ramos: [] };
      atual.scoreRrf += 1 / (k + indice + 1);
      atual.ramos.push(nome);
      fundidos.set(item.id, atual);
    });
  }
  const ordenados = [...fundidos.values()].sort(
    (a, b) => b.scoreRrf - a.scoreRrf || (a.id < b.id ? -1 : 1)
  );
  return limite ? ordenados.slice(0, limite) : ordenados;
}

module.exports = { fundirRRF, RRF_K };
