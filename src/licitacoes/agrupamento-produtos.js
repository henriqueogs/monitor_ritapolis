'use strict';

// Agrupamento de produtos equivalentes por similaridade de embeddings, para
// comparar preço unitário do mesmo item ao longo dos anos. As descrições variam
// ("gasolina" / "gasolina comum" / "gasolina comum tipo C") e só a proximidade
// semântica dos vetores agrupa de forma robusta.

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Números "de especificação" de uma descrição (tamanho, peso, voltagem). Tokens
// puramente numéricos, normalizados sem zeros à esquerda. Embeddings não pesam
// números, então usamos isso como guarda: "pneu 205 70 r15" ≠ "pneu 185 60 r15".
function assinaturaNumerica(texto) {
  const matches = String(texto || '').match(/\d+/g) || [];
  return matches.map((n) => String(Number(n)));
}

// Dois itens são numericamente compatíveis se algum lado não tem números, ou se
// os conjuntos de números coincidem. Lado sem número = genérico ("oleo diesel"
// agrupa com "oleo diesel s10").
function numerosCompativeis(a, b) {
  const na = assinaturaNumerica(a);
  const nb = assinaturaNumerica(b);
  if (na.length === 0 || nb.length === 0) {
    return true;
  }
  const setA = new Set(na);
  const setB = new Set(nb);
  if (setA.size !== setB.size) {
    return false;
  }
  for (const n of setA) {
    if (!setB.has(n)) {
      return false;
    }
  }
  return true;
}

// Escolhe o rótulo canônico de um grupo: maior peso (frequência), desempate
// pelo mais curto (descrição mais "limpa").
function escolherRotuloCanonico(membros) {
  return [...membros]
    .sort((a, b) => b.peso - a.peso || a.chave.length - b.chave.length)
    .map((m) => m.chave)[0];
}

/**
 * Agrupamento guloso por similaridade de cosseno. Cada item entra no primeiro
 * grupo cujo representante (centro) tem similaridade ≥ limiar; senão abre um
 * novo grupo. Itens processados por peso decrescente para que os mais
 * frequentes ancorem os grupos.
 *
 * @param {Array<{chave:string, vetor:number[], peso:number}>} itens
 * @param {{ limiar?: number }} opcoes
 * @returns {Array<{ representante:string, membros:string[] }>}
 */
function agruparPorSimilaridade(itens, { limiar = 0.86, guardaNumerica = false } = {}) {
  const ordenados = [...itens].sort((a, b) => b.peso - a.peso);
  const grupos = [];

  for (const item of ordenados) {
    let melhor = null;
    let melhorSim = limiar;
    for (const grupo of grupos) {
      if (guardaNumerica && !numerosCompativeis(item.chave, grupo.representanteChave)) {
        continue;
      }
      const sim = cosineSimilarity(item.vetor, grupo.centro);
      if (sim >= melhorSim) {
        melhor = grupo;
        melhorSim = sim;
      }
    }

    if (melhor) {
      melhor.itens.push(item);
    } else {
      // representanteChave = âncora (maior peso, processada primeiro) p/ guarda numérica
      grupos.push({ centro: item.vetor, representanteChave: item.chave, itens: [item] });
    }
  }

  return grupos.map((g) => ({
    representante: escolherRotuloCanonico(g.itens),
    membros: g.itens.map((i) => i.chave),
  }));
}

module.exports = {
  cosineSimilarity,
  agruparPorSimilaridade,
  escolherRotuloCanonico,
  assinaturaNumerica,
  numerosCompativeis,
};
