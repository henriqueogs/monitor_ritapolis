'use strict';

const { resumirTotaisPorEsfera } = require('../frontend/lib/emendas-totais');

const TOTAIS = [
  { ano: 2025, esfera: 'federal', total_emendas: 2, soma_repasse: 500 },
  { ano: 2023, esfera: 'federal', total_emendas: 1, soma_repasse: 300 },
  { ano: 2024, esfera: 'estadual', total_emendas: 3, soma_repasse: 90 },
];

describe('resumirTotaisPorEsfera', () => {
  it('destaca o ano mais recente e deixa o acumulado com o intervalo como secundário', () => {
    // Act
    const resumo = resumirTotaisPorEsfera(TOTAIS);

    // Assert
    expect(resumo.anoDestaque).toBe(2025);
    expect(resumo.esferas.federal).toEqual({
      ano: { total_emendas: 2, soma_repasse: 500 },
      acumulado: { total_emendas: 3, soma_repasse: 800, intervalo: '2023–2025' },
      semAno: { total_emendas: 0, soma_repasse: 0 },
    });
    expect(resumo.esferas.estadual.ano).toEqual({ total_emendas: 0, soma_repasse: 0 });
    expect(resumo.esferas.estadual.acumulado.intervalo).toBe('2024');
  });

  it('com ano selecionado no filtro, o destaque é esse ano', () => {
    // Act
    const resumo = resumirTotaisPorEsfera(TOTAIS, '2024');

    // Assert
    expect(resumo.anoDestaque).toBe(2024);
    expect(resumo.esferas.estadual.ano).toEqual({ total_emendas: 3, soma_repasse: 90 });
    expect(resumo.esferas.federal.ano).toEqual({ total_emendas: 0, soma_repasse: 0 });
  });

  it('linha sem ano fica fora do acumulado com intervalo e é contada à parte', () => {
    // Act
    const resumo = resumirTotaisPorEsfera([
      { ano: 2024, esfera: 'federal', total_emendas: 1, soma_repasse: 300 },
      { ano: null, esfera: 'federal', total_emendas: 2, soma_repasse: 5000 },
    ]);

    // Assert
    expect(resumo.esferas.federal.acumulado).toEqual({ total_emendas: 1, soma_repasse: 300, intervalo: '2024' });
    expect(resumo.esferas.federal.semAno).toEqual({ total_emendas: 2, soma_repasse: 5000 });
  });

  it('sem totais retorna vazio', () => {
    expect(resumirTotaisPorEsfera([])).toEqual({ anoDestaque: null, esferas: {} });
  });
});
