'use strict';

const { agruparPorCategoriaAno } = require('../agrupador');

// Emite sinal quando uma categoria se repete num mesmo ano acima do limiar.
// Ignora "Outros" (categoria genérica não é tema relevante).
function detectarRepeticaoTematica(docs, { minRepeticao = 2 } = {}) {
  const sinais = [];
  for (const grupo of agruparPorCategoriaAno(docs).values()) {
    const categoria = grupo[0].categoria;
    if (!categoria || categoria === 'Outros') {
      continue;
    }
    if (grupo.length < minRepeticao) {
      continue;
    }
    sinais.push({
      tipo: 'repeticao_tematica',
      categoria,
      ano: grupo[0].ano ?? null,
      severidade: 'info',
      documentos: grupo.map((d) => d.id),
      motivo: `${grupo.length} processos de ${categoria} em ${grupo[0].ano ?? 's/ ano'}`,
    });
  }
  return sinais;
}

module.exports = { detectarRepeticaoTematica };
