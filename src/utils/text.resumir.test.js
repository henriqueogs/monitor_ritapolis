'use strict';

const { resumirTextoLimpo } = require('./text');

describe('resumirTextoLimpo', () => {
  it('pula linhas-lixo de cabeçalho OCR e pega o conteúdo real', () => {
    const texto = 'a,r t B B !4tS r &*1Jt\n:t):11:t::tti\nRESOLUÇÃO N. 01/2025\nO Conselho Municipal dos Direitos da Criança mantém a conselheira.';
    const r = resumirTextoLimpo(texto);
    expect(r.startsWith('RESOLUÇÃO N. 01/2025')).toBe(true);
    expect(r).not.toMatch(/!4tS|&\*1Jt/);
  });

  it('mantém texto limpo desde a primeira linha', () => {
    const texto = 'Contratação de empresa para fornecimento de combustível ao município.';
    expect(resumirTextoLimpo(texto)).toBe(texto);
  });

  it('respeita o limite de caracteres', () => {
    const texto = 'palavra com muitas vogais aqui '.repeat(40);
    expect(resumirTextoLimpo(texto, 100).length).toBeLessThanOrEqual(100);
  });

  it('retorna null para vazio/nulo', () => {
    expect(resumirTextoLimpo('')).toBeNull();
    expect(resumirTextoLimpo(null)).toBeNull();
  });

  it('se todas as linhas forem ruído, ainda retorna algo (não trava)', () => {
    const r = resumirTextoLimpo(':: !! ## && \n @@ ** $$');
    expect(r === null || typeof r === 'string').toBe(true);
  });
});
