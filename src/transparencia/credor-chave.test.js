'use strict';

const { slugNomeCredor, buildCredorChave, parseCredorChave, PF_PREFIXO } = require('./credor-chave');

describe('credor-chave', () => {
  describe('slugNomeCredor', () => {
    it('remove acentos, baixa caixa e troca separadores por hífen', () => {
      expect(slugNomeCredor('JOSÉ MARIA DA SILVA')).toBe('jose-maria-da-silva');
      expect(slugNomeCredor('  Maria   Terêsa de Resende ')).toBe('maria-teresa-de-resende');
      expect(slugNomeCredor('JOÃO D\'ÁVILA & FILHOS')).toBe('joao-d-avila-filhos');
    });

    it('nome vazio ou null vira string vazia', () => {
      expect(slugNomeCredor('')).toBe('');
      expect(slugNomeCredor(null)).toBe('');
      expect(slugNomeCredor('   ')).toBe('');
    });
  });

  describe('buildCredorChave', () => {
    it('CNPJ (formatado ou não) vira 14 dígitos', () => {
      expect(buildCredorChave({ cnpj: '12.345.678/0001-90', nome: 'EMPRESA X' })).toBe('12345678000190');
      expect(buildCredorChave({ cnpj: '12345678000190', nome: 'EMPRESA X' })).toBe('12345678000190');
    });

    it('sem CNPJ, usa pf- + slug do nome', () => {
      expect(buildCredorChave({ cnpj: null, nome: 'ADILSON DE SOUZA MELO' })).toBe('pf-adilson-de-souza-melo');
      expect(buildCredorChave({ cnpj: '', nome: 'JOSÉ CARLOS' })).toBe('pf-jose-carlos');
    });

    it('sem CNPJ nem nome, retorna null', () => {
      expect(buildCredorChave({ cnpj: null, nome: null })).toBeNull();
      expect(buildCredorChave({ cnpj: '', nome: '   ' })).toBeNull();
    });

    it('CNPJ inválido (menos de 14 dígitos) cai pro nome', () => {
      expect(buildCredorChave({ cnpj: '123', nome: 'FULANO' })).toBe('pf-fulano');
    });
  });

  describe('parseCredorChave', () => {
    it('aceita CNPJ com ou sem formatação', () => {
      expect(parseCredorChave('12.345.678/0001-90')).toEqual({ tipo: 'cnpj', chave: '12345678000190' });
      expect(parseCredorChave('12345678000190')).toEqual({ tipo: 'cnpj', chave: '12345678000190' });
    });

    it('aceita chave pf-', () => {
      expect(parseCredorChave('pf-jose-maria')).toEqual({ tipo: 'pf', chave: 'pf-jose-maria' });
    });

    it('rejeita entradas inválidas', () => {
      expect(parseCredorChave('abc')).toBeNull();
      expect(parseCredorChave('')).toBeNull();
      expect(parseCredorChave(null)).toBeNull();
      expect(parseCredorChave('pf-')).toBeNull();
      expect(parseCredorChave('123')).toBeNull();
    });
  });

  it('exporta o prefixo PF como constante', () => {
    expect(PF_PREFIXO).toBe('pf-');
  });
});
