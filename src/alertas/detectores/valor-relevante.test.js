'use strict';

const { detectarValorRelevante } = require('./valor-relevante');

function doc(id, categoria, ano, valor) {
  return { id, categoria, ano, data_publicacao: `${ano}-01-01`, valor, resumo: null };
}

describe('detectarValorRelevante', () => {
  it('emite sinal quando soma do ano atinge o limiar', () => {
    const docs = [
      doc(1, 'Obras', 2025, 300000),
      doc(2, 'Obras', 2025, 300000),
    ];
    const sinais = detectarValorRelevante(docs, { valorThreshold: 500000 });
    expect(sinais).toHaveLength(1);
    expect(sinais[0].tipo).toBe('valor_relevante');
    expect(sinais[0].valor).toBe(600000);
    expect(sinais[0].severidade).toBe('atencao');
    expect(sinais[0].documentos).toEqual([1, 2]);
  });

  it('não emite sinal abaixo do limiar', () => {
    const docs = [doc(1, 'Obras', 2025, 100000)];
    const sinais = detectarValorRelevante(docs, { valorThreshold: 500000 });
    expect(sinais).toHaveLength(0);
  });

  it('ignora categoria "Outros"', () => {
    const docs = [doc(1, 'Outros', 2025, 1000000)];
    const sinais = detectarValorRelevante(docs, { valorThreshold: 500000 });
    expect(sinais).toHaveLength(0);
  });

  it('ignora documentos sem valor', () => {
    const docs = [doc(1, 'Obras', 2025, 0), doc(2, 'Obras', 2025, 0)];
    const sinais = detectarValorRelevante(docs, { valorThreshold: 500000 });
    expect(sinais).toHaveLength(0);
  });

  it('separa por ano', () => {
    const docs = [doc(1, 'Obras', 2024, 600000), doc(2, 'Obras', 2025, 600000)];
    const sinais = detectarValorRelevante(docs, { valorThreshold: 500000 });
    expect(sinais).toHaveLength(2);
  });

  it('motivo inclui valor formatado e ano', () => {
    const docs = [doc(1, 'Saúde', 2025, 750000)];
    const sinais = detectarValorRelevante(docs, { valorThreshold: 500000 });
    expect(sinais[0].motivo).toContain('R$');
    expect(sinais[0].motivo).toContain('2025');
  });
});
