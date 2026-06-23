'use strict';

const { detectarRepeticaoTematica } = require('./repeticao-tematica');
const { detectarRiscoAlto } = require('./risco-alto');
const { detectarValorRelevante } = require('./valor-relevante');
const { detectarAnomaliaTemporal } = require('./anomalia-temporal');
const { detectarQuestionamentos } = require('./questionamentos');

function doc(over = {}) {
  return { id: 1, titulo: 'Doc', categoria: 'Meio ambiente', ano: 2026, valor: 0, grupo_id: null, resumo: null, ...over };
}

describe('detectarRepeticaoTematica', () => {
  it('emite sinal quando categoria repete no ano (>= minRepeticao)', () => {
    const docs = [doc({ id: 1 }), doc({ id: 2 }), doc({ id: 3, ano: 2025 })];
    const s = detectarRepeticaoTematica(docs, { minRepeticao: 2 });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ tipo: 'repeticao_tematica', categoria: 'Meio ambiente', ano: 2026 });
    expect(s[0].documentos).toEqual([1, 2]);
  });

  it('ignora "Outros" e abaixo do limiar', () => {
    expect(detectarRepeticaoTematica([doc({ categoria: 'Outros' }), doc({ id: 2, categoria: 'Outros' })])).toHaveLength(0);
    expect(detectarRepeticaoTematica([doc()], { minRepeticao: 2 })).toHaveLength(0);
  });
});

describe('detectarRiscoAlto', () => {
  it('emite sinal crítico para alerta nivel alto', () => {
    const docs = [
      doc({ id: 1, resumo: { alertas: [{ nivel: 'alto', descricao: 'sem vencedor' }] } }),
      doc({ id: 2, resumo: { alertas: [{ nivel: 'baixo', descricao: 'menor' }] } }),
    ];
    const s = detectarRiscoAlto(docs);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ tipo: 'risco_alto', severidade: 'critico', documentos: [1], motivo: 'sem vencedor' });
  });
});

describe('detectarValorRelevante', () => {
  it('soma por ano e emite sinal acima do limiar (escopado ao ano)', () => {
    const docs = [doc({ id: 1, valor: 300000 }), doc({ id: 2, valor: 300000 }), doc({ id: 3, ano: 2025, valor: 100000 })];
    const s = detectarValorRelevante(docs, { valorThreshold: 500000 });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ tipo: 'valor_relevante', ano: 2026, valor: 600000 });
    expect(s[0].documentos).toEqual([1, 2]);
  });

  it('não emite quando soma do ano fica abaixo do limiar', () => {
    expect(detectarValorRelevante([doc({ valor: 100000 })], { valorThreshold: 500000 })).toHaveLength(0);
  });
});

describe('detectarAnomaliaTemporal', () => {
  it('detecta pico de um ano vs média dos outros', () => {
    const docs = [
      ...[1, 2, 3, 4, 5, 6].map((id) => doc({ id, ano: 2026 })),
      doc({ id: 7, ano: 2024 }),
      doc({ id: 8, ano: 2023 }),
    ];
    const s = detectarAnomaliaTemporal(docs, { multiplicador: 3, minAbsoluto: 3 });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ tipo: 'anomalia_temporal', ano: 2026 });
  });

  it('não acusa quando distribuição é equilibrada', () => {
    const docs = [doc({ id: 1, ano: 2026 }), doc({ id: 2, ano: 2025 }), doc({ id: 3, ano: 2024 })];
    expect(detectarAnomaliaTemporal(docs)).toHaveLength(0);
  });
});

describe('detectarQuestionamentos', () => {
  it('extrai lacunas e consistência incompleta, sem duplicar', () => {
    const docs = [
      doc({
        id: 1,
        resumo: {
          lacunas: [{ campo: 'valor', descricao: 'Sem valor estimado' }],
          consistencia: [{ status: 'incompleto', descricao: 'Sem vencedor' }, { status: 'ok', descricao: 'x' }],
        },
      }),
    ];
    const s = detectarQuestionamentos(docs);
    expect(s).toHaveLength(1);
    expect(s[0].questionamentos).toEqual(['Sem valor estimado', 'Sem vencedor']);
  });

  it('não emite quando não há lacunas nem inconsistências', () => {
    expect(detectarQuestionamentos([doc({ resumo: { lacunas: [], consistencia: [] } })])).toHaveLength(0);
  });
});
