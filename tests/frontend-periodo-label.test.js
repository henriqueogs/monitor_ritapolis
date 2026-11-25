'use strict';

const { montarPeriodoLabel } = require('../frontend/lib/periodo-label');

describe('montarPeriodoLabel', () => {
  const porMandato = [
    { inicio: 2025, anos: [2025, 2026] },
    { inicio: 2021, anos: [2021, 2022, 2023, 2024] },
  ];

  it('mandato em curso mostra só os anos com dado, não o mandato inteiro', () => {
    const periodo = { mandato: { inicio: 2025, fim: 2028 } };
    expect(montarPeriodoLabel('mandato', periodo, porMandato)).toBe('2025–2026');
  });

  it('mandato sem anos no agrupamento cai no intervalo oficial', () => {
    const periodo = { mandato: { inicio: 2017, fim: 2020 } };
    expect(montarPeriodoLabel('mandato', periodo, porMandato)).toBe('2017–2020');
  });

  it('exercício mostra o ano único', () => {
    expect(montarPeriodoLabel('exercicio', { exercicio: 2024 }, porMandato)).toBe('2024');
  });

  it('todos usa os anos cobertos', () => {
    expect(montarPeriodoLabel('todos', { anos_cobertos: [2017, 2026] }, porMandato)).toBe('2017–2026');
  });

  it('sem período devolve rótulo honesto', () => {
    expect(montarPeriodoLabel('todos', {}, [])).toBe('período coletado');
    expect(montarPeriodoLabel('mandato', null, [])).toBe('período coletado');
  });
});
