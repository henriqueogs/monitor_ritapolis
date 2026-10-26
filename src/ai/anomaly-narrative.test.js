'use strict';

jest.mock('../logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { buildPrompt, montarNarrativaSemAnomalias } = require('./anomaly-narrative');

const base = {
  exercicio: 2026,
  outliers_valor: [],
  possivel_fracionamento: [],
  total_outliers: 0,
  total_fracionamento: 0,
  limiar_dispensa: 57900,
  limiar_dispensa_fonte: 'Lei 14.133/2021, art. 75, II, valor atualizado para 2024 (arredondado)',
};

describe('anomaly-narrative buildPrompt', () => {
  it('limiar conferido entra sem ressalva', () => {
    const prompt = buildPrompt({ ...base, limiar_dispensa_extrapolado: false });

    expect(prompt).toContain('LIMITE DE DISPENSA'.replace('LIMITE', 'LIMIAR'));
    expect(prompt).not.toContain('pode estar desatualizado');
  });

  it('limiar extrapolado carrega a ressalva e a fonte, e pede que a IA a mantenha', () => {
    const prompt = buildPrompt({ ...base, limiar_dispensa_extrapolado: true });

    expect(prompt).toContain('pode estar desatualizado');
    expect(prompt).toContain(base.limiar_dispensa_fonte);
    expect(prompt).toMatch(/ressalv/i);
  });
  it('o papel do analista cita o ente informado; sem ente, o configurado', () => {
    const outro = buildPrompt(
      { ...base, limiar_dispensa_extrapolado: false },
      { nome: 'Cidade Exemplo', uf: 'SP' }
    );
    const padrao = buildPrompt({ ...base, limiar_dispensa_extrapolado: false });

    expect(outro).toContain('Prefeitura de Cidade Exemplo (SP)');
    expect(outro).not.toMatch(/rit[aá]polis/i);
    expect(padrao).toContain('Prefeitura de Ritápolis (MG)');
  });
});

describe('anomaly-narrative montarNarrativaSemAnomalias', () => {
  it('texto sem anomalias usa o ente e o exercício', () => {
    const texto = montarNarrativaSemAnomalias(2026, { nome: 'Cidade Exemplo', uf: 'SP' });

    expect(texto).toContain('empenhos de 2026');
    expect(texto).toContain('Prefeitura de Cidade Exemplo');
    expect(texto).not.toMatch(/rit[aá]polis/i);
  });

  it('sem ente informado usa o configurado', () => {
    expect(montarNarrativaSemAnomalias(2026)).toContain('Prefeitura de Ritápolis');
  });
});
