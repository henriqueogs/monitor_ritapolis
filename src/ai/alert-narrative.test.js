'use strict';

const { gerarNarrativaAlerta, validateNarrative, extractJsonObject } = require('./alert-narrative');

function mockProvider(response) {
  return {
    provider: 'mock',
    model: 'mock-model',
    generateJson: jest.fn().mockResolvedValue(response),
  };
}

const alertaBase = {
  categoria: 'Meio Ambiente',
  ano: 2026,
  documentos: [
    { id: 1, titulo: 'Corte de arvores - aditivo 1', data_publicacao: '2026-01-15', url_origem: 'https://exemplo/1', valor: 50000 },
    { id: 2, titulo: 'Corte de arvores - aditivo 2', data_publicacao: '2026-03-20', url_origem: 'https://exemplo/2', valor: 60000 },
  ],
  valor_total: 110000,
  valor_periodo_label: 'Estimado em 2026',
  periodo_inicio: '2026-01-15',
  periodo_fim: '2026-03-20',
  questionamentos: ['Nao ha projeto associado ao corte'],
  metadados: { sinais: ['repeticao_tematica'], motivos: ['2 processos de Meio Ambiente em 2026'] },
};

describe('gerarNarrativaAlerta', () => {
  beforeEach(() => {
    process.env.AI_SUMMARY_ENABLED = 'true';
  });

  it('gera narrativa valida a partir da resposta do provider', async () => {
    const provider = mockProvider(
      JSON.stringify({
        titulo: 'Cortes de arvores em 2026',
        narrativa: 'Em 2026, dois aditivos envolvendo corte de arvores somam R$ 110.000.',
        questionamentos: ['Foi feita analise ambiental?'],
      })
    );
    const result = await gerarNarrativaAlerta(alertaBase, { provider });
    expect(result.titulo).toBe('Cortes de arvores em 2026');
    expect(result.narrativa).toContain('arvores');
    expect(result.questionamentos).toHaveLength(1);
    expect(provider.generateJson).toHaveBeenCalledTimes(1);
  });

  it('extrai JSON mesmo com markdown fences', async () => {
    const provider = mockProvider(
      '```json\n{"titulo":"T","narrativa":"N","questionamentos":[]}\n```'
    );
    const result = await gerarNarrativaAlerta(alertaBase, { provider });
    expect(result.titulo).toBe('T');
    expect(result.narrativa).toBe('N');
  });

  it('lanca erro quando resposta nao contem JSON', async () => {
    const provider = mockProvider('sem json aqui');
    await expect(gerarNarrativaAlerta(alertaBase, { provider })).rejects.toThrow(
      /JSON valido/
    );
  });

  it('lanca erro quando narrativa esta fora do contrato', async () => {
    const provider = mockProvider(JSON.stringify({ titulo: 'T' }));
    await expect(gerarNarrativaAlerta(alertaBase, { provider })).rejects.toThrow(
      /contrato/
    );
  });

  it('lanca erro quando IA esta desativada', async () => {
    jest.resetModules();
    jest.doMock('../config', () => ({ aiSummaryEnabled: false }));
    jest.doMock('../logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
    const { gerarNarrativaAlerta: gerar } = require('./alert-narrative');
    await expect(gerar(alertaBase)).rejects.toThrow(/desativada/);
    jest.dontMock('../config');
    jest.dontMock('../logger');
    jest.resetModules();
  });
});

describe('validateNarrative', () => {
  it('aceita narrativa valida', () => {
    const result = validateNarrative({
      titulo: 'T',
      narrativa: 'N',
      questionamentos: ['q1'],
    });
    expect(result.titulo).toBe('T');
    expect(result.questionamentos).toEqual(['q1']);
  });

  it('default questionamentos para array vazio', () => {
    const result = validateNarrative({ titulo: 'T', narrativa: 'N' });
    expect(result.questionamentos).toEqual([]);
  });

  it('rejeita sem narrativa', () => {
    expect(() => validateNarrative({ titulo: 'T' })).toThrow(/contrato/);
  });
});

describe('extractJsonObject', () => {
  it('parseia JSON puro', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it('extrai JSON de texto com markdown', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('extrai JSON embarcado em texto', () => {
    expect(extractJsonObject('antes {"a":1} depois')).toEqual({ a: 1 });
  });

  it('lanca erro para resposta vazia', () => {
    expect(() => extractJsonObject('')).toThrow(/vazia/);
  });

  it('lanca erro quando nao ha JSON', () => {
    expect(() => extractJsonObject('sem json')).toThrow(/JSON valido/);
  });
});
