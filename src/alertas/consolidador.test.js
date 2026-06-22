'use strict';

const { consolidarSinais } = require('./consolidador');

function doc(id, opts = {}) {
  return {
    id,
    titulo: opts.titulo || `Doc ${id}`,
    categoria: opts.categoria || 'Saúde',
    ano: opts.ano ?? 2025,
    data_publicacao: opts.data_publicacao || '2025-06-01',
    valor: opts.valor ?? 0,
    grupo_id: opts.grupo_id ?? null,
    url_origem: `https://exemplo/${id}`,
    resumo: opts.resumo ?? { confianca: 0.9 },
  };
}

describe('consolidarSinais', () => {
  it('consolida sinais temáticos em um alerta por (categoria, ano)', () => {
    const sinais = [
      { tipo: 'repeticao_tematica', categoria: 'Saúde', ano: 2025, severidade: 'info', documentos: [1, 2], motivo: '2 processos' },
      { tipo: 'valor_relevante', categoria: 'Saúde', ano: 2025, severidade: 'atencao', documentos: [1, 2], valor: 600000, motivo: 'R$ 600k' },
    ];
    const docsById = new Map([[1, doc(1)], [2, doc(2)]]);
    const alertas = consolidarSinais(sinais, docsById);
    expect(alertas).toHaveLength(1);
    expect(alertas[0].tipo).toBe('tematico');
    expect(alertas[0].categoria).toBe('Saúde');
    expect(alertas[0].severidade).toBe('atencao');
    expect(alertas[0].documentos_ids).toEqual([1, 2]);
    expect(alertas[0].valor_total).toBe(600000);
    expect(alertas[0].valor_periodo_label).toContain('2025');
  });

  it('cria alerta de processo para risco alto', () => {
    const sinais = [
      { tipo: 'risco_alto', categoria: 'Saúde', ano: 2025, severidade: 'critico', documentos: [1], motivo: 'Sobrepreço', trechos: ['trecho1'] },
    ];
    const docsById = new Map([[1, doc(1, { valor: 100000 })]]);
    const alertas = consolidarSinais(sinais, docsById);
    expect(alertas).toHaveLength(1);
    expect(alertas[0].tipo).toBe('processo');
    expect(alertas[0].severidade).toBe('critico');
    expect(alertas[0].documentos_ids).toEqual([1]);
    expect(alertas[0].valor_total).toBe(100000);
  });

  it('anexa questionamentos aos alertas temáticos', () => {
    const sinais = [
      { tipo: 'repeticao_tematica', categoria: 'Saúde', ano: 2025, severidade: 'info', documentos: [1, 2] },
      { tipo: 'questionamento', categoria: 'Saúde', ano: 2025, severidade: 'info', documentos: [1], questionamentos: ['Sem projeto'] },
    ];
    const docsById = new Map([[1, doc(1)], [2, doc(2)]]);
    const alertas = consolidarSinais(sinais, docsById);
    expect(alertas[0].questionamentos).toContain('Sem projeto');
  });

  it('gera chave_unica distinta por (categoria, ano)', () => {
    const sinais = [
      { tipo: 'repeticao_tematica', categoria: 'Saúde', ano: 2025, severidade: 'info', documentos: [1] },
      { tipo: 'repeticao_tematica', categoria: 'Educação', ano: 2025, severidade: 'info', documentos: [2] },
    ];
    const docsById = new Map([[1, doc(1, { categoria: 'Saúde' })], [2, doc(2, { categoria: 'Educação' })]]);
    const alertas = consolidarSinais(sinais, docsById);
    expect(alertas).toHaveLength(2);
    const chaves = alertas.map((a) => a.chave_unica);
    expect(new Set(chaves).size).toBe(2);
  });

  it('calcula periodo_inicio e periodo_fim das datas de publicação', () => {
    const sinais = [
      { tipo: 'repeticao_tematica', categoria: 'Saúde', ano: 2025, severidade: 'info', documentos: [1, 2] },
    ];
    const docsById = new Map([
      [1, doc(1, { data_publicacao: '2025-03-01' })],
      [2, doc(2, { data_publicacao: '2025-06-01' })],
    ]);
    const alertas = consolidarSinais(sinais, docsById);
    expect(alertas[0].periodo_inicio).toBe('2025-03-01');
    expect(alertas[0].periodo_fim).toBe('2025-06-01');
  });

  it('lida com lista de sinais vazia', () => {
    const alertas = consolidarSinais([], new Map());
    expect(alertas).toEqual([]);
  });

  it('ignora sinais temáticos cujos documentos não estão em docsById', () => {
    const sinais = [
      { tipo: 'repeticao_tematica', categoria: 'Saúde', ano: 2025, severidade: 'info', documentos: [999] },
    ];
    const alertas = consolidarSinais(sinais, new Map());
    expect(alertas).toEqual([]);
  });

  it('calcula confiança média dos documentos', () => {
    const sinais = [
      { tipo: 'repeticao_tematica', categoria: 'Saúde', ano: 2025, severidade: 'info', documentos: [1, 2] },
    ];
    const docsById = new Map([
      [1, doc(1, { resumo: { confianca: 0.8 } })],
      [2, doc(2, { resumo: { confianca: 0.6 } })],
    ]);
    const alertas = consolidarSinais(sinais, docsById);
    expect(alertas[0].confianca).toBe(0.7);
  });
});
