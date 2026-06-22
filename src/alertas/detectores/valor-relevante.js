'use strict';

const { agruparPorCategoriaAno } = require('../agrupador');
const { formatBRL } = require('../tipos');

// Soma os valores por (categoria, ano); emite sinal quando a soma do ANO atinge
// o limiar. Valor sempre escopado ao ano (§11.1).
function detectarValorRelevante(docs, { valorThreshold = 500000 } = {}) {
  const sinais = [];
  for (const grupo of agruparPorCategoriaAno(docs).values()) {
    const categoria = grupo[0].categoria;
    if (!categoria || categoria === 'Outros') {
      continue;
    }
    const comValor = grupo.filter((d) => Number(d.valor) > 0);
    const soma = comValor.reduce((s, d) => s + Number(d.valor), 0);
    if (soma < valorThreshold) {
      continue;
    }
    sinais.push({
      tipo: 'valor_relevante',
      categoria,
      ano: grupo[0].ano ?? null,
      severidade: 'atencao',
      documentos: comValor.map((d) => d.id),
      valor: soma,
      motivo: `${formatBRL(soma)} em ${categoria} (${grupo[0].ano ?? 's/ ano'})`,
    });
  }
  return sinais;
}

module.exports = { detectarValorRelevante };
