'use strict';

// Agrupa documentos enriquecidos por (categoria, ano) e por grupo de processo.
// Funções puras — base para os detectores temáticos e de processo.

function chaveCategoriaAno(doc) {
  const cat = doc.categoria || 'Outros';
  const ano = doc.ano ?? 'sem-ano';
  return `${cat}|${ano}`;
}

function agruparPorCategoriaAno(docs) {
  const mapa = new Map();
  for (const doc of docs) {
    const chave = chaveCategoriaAno(doc);
    if (!mapa.has(chave)) {
      mapa.set(chave, []);
    }
    mapa.get(chave).push(doc);
  }
  return mapa;
}

function agruparPorGrupo(docs) {
  const mapa = new Map();
  for (const doc of docs) {
    if (doc.grupo_id === null || doc.grupo_id === undefined) {
      continue;
    }
    const chave = String(doc.grupo_id);
    if (!mapa.has(chave)) {
      mapa.set(chave, []);
    }
    mapa.get(chave).push(doc);
  }
  return mapa;
}

module.exports = { chaveCategoriaAno, agruparPorCategoriaAno, agruparPorGrupo };
