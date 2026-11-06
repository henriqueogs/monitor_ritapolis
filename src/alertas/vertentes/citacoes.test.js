'use strict';

const { citacoesDoHistorico, resumirCitacoes, frasesDasCitacoes } = require('./citacoes');

describe('citacoesDoHistorico', () => {
  it('lê processo licitatório com ano curto ou completo', () => {
    expect(citacoesDoHistorico('... CONFORME PROCESSO LICITATÓRIO N°52/25 E OFÍCIO').processo).toBe(
      '52/2025'
    );
    expect(citacoesDoHistorico('PROCESSO LICITATÓRIO Nº 0019/2026').processo).toBe('19/2026');
  });

  it('lê adesão a ata, com zeros à esquerda', () => {
    expect(citacoesDoHistorico('ADESÃO N°012/2025 E MEMORANDO').adesao).toBe('12/2025');
    expect(citacoesDoHistorico('adesao n° 12/2025').adesao).toBe('12/2025');
  });

  it('sem citação devolve nulos', () => {
    expect(citacoesDoHistorico('Aquisição de pneus')).toEqual({ processo: null, adesao: null });
    expect(citacoesDoHistorico(null)).toEqual({ processo: null, adesao: null });
  });
});

describe('resumirCitacoes', () => {
  const emp = historico => ({ historico });

  it('conta empenhos por processo e adesão citados e os que não citam nada', () => {
    const r = resumirCitacoes([
      emp('PROCESSO LICITATÓRIO N°52/25 ADESÃO N°12/2025'),
      emp('PROCESSO LICITATÓRIO N°52/25'),
      emp('PROCESSO LICITATÓRIO N°9/25'),
      emp('sem nada'),
    ]);
    expect(r.processos).toEqual([
      { chave: '52/2025', n: 2 },
      { chave: '9/2025', n: 1 },
    ]);
    expect(r.adesoes).toEqual([{ chave: '12/2025', n: 1 }]);
    expect(r.semCitacao).toBe(1);
    expect(r.total).toBe(4);
  });
});

describe('frasesDasCitacoes', () => {
  it('sem citação: diz que os históricos não citam processo nem ata', () => {
    const f = frasesDasCitacoes({ processos: [], adesoes: [], semCitacao: 4, total: 4 });
    expect(f.achado).toMatch(/não citam processo nem adesão/);
    expect(f.severidade).toBe('atencao');
  });

  it('com citação: lista processo e adesão e pede para conferir no portal', () => {
    const f = frasesDasCitacoes({
      processos: [{ chave: '52/2025', n: 8 }],
      adesoes: [{ chave: '12/2025', n: 5 }],
      semCitacao: 1,
      total: 9,
    });
    expect(f.achado).toContain('Processo 52/2025 (8 de 9 empenhos)');
    expect(f.achado).toContain('Adesão 12/2025 (5 de 9 empenhos)');
    expect(f.achado).toMatch(/não está no acervo|não localizou/);
    expect(f.severidade).toBe('info');
  });
});
