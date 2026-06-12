'use strict';

const { normalizeProcessoChave, normalizeNumeroPncpChave, onlyDigits } = require('./processo');

describe('processo — normalizeProcessoChave', () => {
  it('extrai apenas dígitos quando há 4+ dígitos no texto', () => {
    expect(normalizeProcessoChave('PP-001/2024')).toBe('0012024');
  });

  it('remove acentos, converte para minúsculas e remove espaços (< 4 dígitos)', () => {
    // Sem dígitos suficientes: retorna texto sem espaços
    expect(normalizeProcessoChave('Pregão Eletrônico')).toBe('pregaoeletronico');
  });

  it('remove espaços quando resultado não tem 4+ dígitos', () => {
    expect(normalizeProcessoChave('ab-cd')).toBe('abcd');
  });

  it('retorna null para string vazia', () => {
    expect(normalizeProcessoChave('')).toBeNull();
  });

  it('retorna null para null/undefined', () => {
    expect(normalizeProcessoChave(null)).toBeNull();
    expect(normalizeProcessoChave(undefined)).toBeNull();
  });

  it('normaliza número com pontos e barras', () => {
    expect(normalizeProcessoChave('002.003/2023')).toBe('0020032023');
  });
});

describe('processo — normalizeNumeroPncpChave', () => {
  it('remove espaços e converte para minúsculas', () => {
    expect(normalizeNumeroPncpChave('18557553000105-1-000042/2024')).toBe(
      '18557553000105-1-000042/2024'
    );
  });

  it('retorna null para valor vazio', () => {
    expect(normalizeNumeroPncpChave('')).toBeNull();
    expect(normalizeNumeroPncpChave(null)).toBeNull();
  });

  it('remove espaços internos', () => {
    expect(normalizeNumeroPncpChave('18557553 000105')).toBe('18557553000105');
  });
});

describe('processo — onlyDigits', () => {
  it('remove tudo exceto dígitos', () => {
    expect(onlyDigits('PP-001/2024')).toBe('0012024');
  });

  it('retorna string vazia para valor sem dígitos', () => {
    expect(onlyDigits('abc')).toBe('');
  });

  it('aceita número diretamente', () => {
    expect(onlyDigits(12345)).toBe('12345');
  });

  it('retorna string vazia para null/undefined', () => {
    expect(onlyDigits(null)).toBe('');
    expect(onlyDigits(undefined)).toBe('');
  });
});

describe('processo — normalizarNumeroDocumento', () => {
  const { normalizarNumeroDocumento } = require('./processo');

  it('remove pontuação solta no fim — caso real "011/2016."', () => {
    expect(normalizarNumeroDocumento('011/2016.')).toBe('011/2016');
  });

  it('remove pontuação e espaços nas bordas', () => {
    expect(normalizarNumeroDocumento(' 008/2020 -')).toBe('008/2020');
  });

  it('preserva número já limpo', () => {
    expect(normalizarNumeroDocumento('0011/2020')).toBe('0011/2020');
  });

  it('preserva separadores internos', () => {
    expect(normalizarNumeroDocumento('002.003/2023')).toBe('002.003/2023');
  });

  it('retorna null para vazio/null', () => {
    expect(normalizarNumeroDocumento('')).toBeNull();
    expect(normalizarNumeroDocumento(null)).toBeNull();
    expect(normalizarNumeroDocumento('.-/')).toBeNull();
  });
});

describe('processo — similaridadeTitulos', () => {
  const { similaridadeTitulos } = require('./processo');

  it('retorna 1 para títulos idênticos', () => {
    expect(similaridadeTitulos('Pregão RP 006/2020', 'Pregão RP 006/2020')).toBe(1);
  });

  it('alta para re-upload do mesmo edital (variação de formatação) — caso real 0011/2020', () => {
    const a = 'Processo 0011/2020 - Pregão RP 006/2020 - Registro de preços para aquisição de medicamentos';
    const b = 'Processo 0011/2020 - Pregão RP 06/2020 - Registro de preços para aquisição de medicamentos';
    expect(similaridadeTitulos(a, b)).toBeGreaterThanOrEqual(0.5);
  });

  it('baixa para processos distintos que dividem o número — caso real 0001/2018', () => {
    const a = 'Processo 0001/2018 - Tomada de Preços - Contratação de empresa para prestação de serviços de engenharia';
    const b = 'Processo 0001/2018 - Pregão - Chamamento para credenciamento de leiloeiro oficial';
    expect(similaridadeTitulos(a, b)).toBeLessThan(0.5);
  });

  it('ignora acentos e caixa', () => {
    expect(similaridadeTitulos('PREGÃO ELETRÔNICO', 'pregao eletronico')).toBe(1);
  });

  it('retorna 0 quando um dos títulos está vazio', () => {
    expect(similaridadeTitulos('', 'Pregão')).toBe(0);
    expect(similaridadeTitulos(null, 'Pregão')).toBe(0);
  });
});

describe('processo — titulosCompativeis', () => {
  const { titulosCompativeis } = require('./processo');

  it('compatível: re-upload do mesmo edital com variação de formatação', () => {
    const a = 'Processo 0011/2020 - Pregão RP 006/2020 - Registro de preços para aquisição de medicamentos';
    const b = 'Processo 0011/2020 - Pregão RP 06/2020 - Registro de preços para aquisição de medicamentos';
    expect(titulosCompativeis(a, b)).toBe(true);
  });

  it('incompatível: aditamentos de contratos DIFERENTES (refs numéricas disjuntas) — caso real 011/2016', () => {
    const a = 'Aditamento ao Contrato nº 072/2016 - PREFEITURA MUNICIPAL DE RITAPOLIS';
    const b = 'Aditamento ao Contrato nº 074/2016 - PREFEITURA MUNICIPAL DE RITAPOLIS';
    expect(titulosCompativeis(a, b)).toBe(false);
  });

  it('incompatível: processos distintos sob o mesmo número — caso real 0001/2018', () => {
    const a = 'Processo 0001/2018 - Tomada de Preços - Contratação de empresa para prestação de serviços de engenharia';
    const b = 'Processo 0001/2018 - Pregão - Chamamento para credenciamento de leiloeiro oficial';
    expect(titulosCompativeis(a, b)).toBe(false);
  });

  it('compatível quando um dos títulos está ausente (sem evidência contra)', () => {
    expect(titulosCompativeis(null, 'Pregão 001/2024')).toBe(true);
    expect(titulosCompativeis('Pregão 001/2024', '')).toBe(true);
  });
});
