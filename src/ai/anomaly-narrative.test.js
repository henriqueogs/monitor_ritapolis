'use strict';

jest.mock('../logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { buildPrompt } = require('./anomaly-narrative');

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
});
