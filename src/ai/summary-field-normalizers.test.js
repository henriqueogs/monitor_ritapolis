'use strict';

const {
  normalizeDateValue,
  normalizeNumberValue,
  normalizeListValue,
} = require('./summary-field-normalizers');

describe('SummaryFieldNormalizers', () => {
  describe('normalizeDateValue', () => {
    it('converte formato BR DD/MM/AAAA para ISO AAAA-MM-DD', () => {
      expect(normalizeDateValue('15/03/2024')).toBe('2024-03-15');
    });

    it('mantém formato ISO quando já correto', () => {
      expect(normalizeDateValue('2024-03-15')).toBe('2024-03-15');
    });

    it('aceita separador traço e ponto no formato BR', () => {
      expect(normalizeDateValue('15-03-2024')).toBe('2024-03-15');
      expect(normalizeDateValue('15.03.2024')).toBe('2024-03-15');
    });

    it('completa zeros de dia e mês', () => {
      expect(normalizeDateValue('5/3/2024')).toBe('2024-03-05');
      expect(normalizeDateValue('2024-3-5')).toBe('2024-03-05');
    });

    it('converte data por extenso', () => {
      expect(normalizeDateValue('5 de março de 2024')).toBe('2024-03-05');
      expect(normalizeDateValue('1º de Janeiro de 2025')).toBe('2025-01-01');
    });

    it('descarta o horário de um timestamp ISO', () => {
      expect(normalizeDateValue('2024-03-15T10:00:00Z')).toBe('2024-03-15');
    });

    it('retorna null para valores vazios ou nulos', () => {
      expect(normalizeDateValue(null)).toBeNull();
      expect(normalizeDateValue(undefined)).toBeNull();
      expect(normalizeDateValue('')).toBeNull();
      expect(normalizeDateValue('N/A')).toBeNull();
      expect(normalizeDateValue('não informado')).toBeNull();
    });

    it('retorna null quando a data é incompleta ou texto livre', () => {
      expect(normalizeDateValue('março de 2024')).toBeNull();
      expect(normalizeDateValue('2024')).toBeNull();
      expect(normalizeDateValue('a definir')).toBeNull();
    });

    it('retorna null para data impossível', () => {
      expect(normalizeDateValue('31/02/2024')).toBeNull();
      expect(normalizeDateValue('2024-13-01')).toBeNull();
    });
  });

  describe('normalizeNumberValue', () => {
    it('mantém número finito', () => {
      expect(normalizeNumberValue(1234.5)).toBe(1234.5);
    });

    it('converte moeda brasileira em texto', () => {
      expect(normalizeNumberValue('R$ 1.234,56')).toBe(1234.56);
    });

    it('converte milhar com ponto sem centavos', () => {
      expect(normalizeNumberValue('R$ 1.500.000')).toBe(1500000);
    });

    it('mantém decimal com ponto', () => {
      expect(normalizeNumberValue('1234.56')).toBe(1234.56);
    });

    it('retorna null quando não há número', () => {
      expect(normalizeNumberValue(null)).toBeNull();
      expect(normalizeNumberValue('')).toBeNull();
      expect(normalizeNumberValue('não informado')).toBeNull();
      expect(normalizeNumberValue(Number.NaN)).toBeNull();
    });
  });

  describe('normalizeListValue', () => {
    it('mantém array', () => {
      const lista = [{ a: 1 }];
      expect(normalizeListValue(lista)).toBe(lista);
    });

    it('troca null e undefined por lista vazia', () => {
      expect(normalizeListValue(null)).toEqual([]);
      expect(normalizeListValue(undefined)).toEqual([]);
    });

    it('embrulha texto não vazio numa lista', () => {
      expect(normalizeListValue('valor estimado')).toEqual(['valor estimado']);
      expect(normalizeListValue('  ')).toEqual([]);
    });

    it('embrulha objeto único numa lista', () => {
      expect(normalizeListValue({ nome: 'x' })).toEqual([{ nome: 'x' }]);
    });
  });
});
