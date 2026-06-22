'use strict';

const { detectarQuestionamentos } = require('./questionamentos');

function doc(id, resumo) {
  return { id, categoria: 'Saúde', ano: 2025, resumo };
}

describe('detectarQuestionamentos', () => {
  it('extrai descrições de lacunas', () => {
    const docs = [
      doc(1, { lacunas: [{ campo: 'projeto', descricao: 'Não há projeto associado ao corte' }] }),
    ];
    const sinais = detectarQuestionamentos(docs);
    expect(sinais).toHaveLength(1);
    expect(sinais[0].questionamentos).toContain('Não há projeto associado ao corte');
  });

  it('extrai inconsistências com status incompleto/divergente', () => {
    const docs = [
      doc(1, { consistencia: [{ status: 'incompleto', campo: 'valor', descricao: 'Valor final ausente' }] }),
    ];
    const sinais = detectarQuestionamentos(docs);
    expect(sinais).toHaveLength(1);
    expect(sinais[0].questionamentos[0]).toContain('Valor final ausente');
  });

  it('ignora consistência com status ok', () => {
    const docs = [
      doc(1, { consistencia: [{ status: 'ok', campo: 'valor', descricao: 'Tudo certo' }] }),
    ];
    const sinais = detectarQuestionamentos(docs);
    expect(sinais).toHaveLength(0);
  });

  it('lida com resumo nulo', () => {
    const sinais = detectarQuestionamentos([doc(1, null)]);
    expect(sinais).toHaveLength(0);
  });

  it('lida com resumo sem lacunas/consistencia', () => {
    const sinais = detectarQuestionamentos([doc(1, { confianca: 0.5 })]);
    expect(sinais).toHaveLength(0);
  });

  it('deduplica questionamentos', () => {
    const docs = [
      doc(1, {
        lacunas: [
          { descricao: 'Sem projeto' },
          { descricao: 'Sem projeto' },
        ],
      }),
    ];
    const sinais = detectarQuestionamentos(docs);
    expect(sinais[0].questionamentos).toEqual(['Sem projeto']);
  });

  it('respeita maxPorDoc', () => {
    const docs = [
      doc(1, {
        lacunas: [
          { descricao: 'q1' }, { descricao: 'q2' }, { descricao: 'q3' },
          { descricao: 'q4' }, { descricao: 'q5' }, { descricao: 'q6' },
        ],
      }),
    ];
    const sinais = detectarQuestionamentos(docs, { maxPorDoc: 3 });
    expect(sinais[0].questionamentos).toHaveLength(3);
  });
});
