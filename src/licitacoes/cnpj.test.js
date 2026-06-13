'use strict';

const { normalizarCnpj, formatarCnpj, cnpjValido } = require('./cnpj');

describe('licitacoes/cnpj · normalizarCnpj', () => {
  it('extrai os 14 dígitos de um CNPJ formatado', () => {
    expect(normalizarCnpj('00.503.272/0001-04')).toBe('00503272000104');
  });

  it('mantém um CNPJ já em dígitos', () => {
    expect(normalizarCnpj('00503272000104')).toBe('00503272000104');
  });

  it('retorna null quando não há 14 dígitos', () => {
    expect(normalizarCnpj('123')).toBeNull();
    expect(normalizarCnpj('')).toBeNull();
    expect(normalizarCnpj(null)).toBeNull();
  });

  it('iguala formatado e dígitos (corrige a fragmentação)', () => {
    expect(normalizarCnpj('00.503.272/0001-04')).toBe(normalizarCnpj('00503272000104'));
  });
});

describe('licitacoes/cnpj · formatarCnpj', () => {
  it('formata dígitos para a máscara canônica', () => {
    expect(formatarCnpj('00503272000104')).toBe('00.503.272/0001-04');
  });

  it('reformata um CNPJ já formatado (idempotente)', () => {
    expect(formatarCnpj('00.503.272/0001-04')).toBe('00.503.272/0001-04');
  });

  it('retorna null para entrada inválida', () => {
    expect(formatarCnpj('123')).toBeNull();
    expect(formatarCnpj(null)).toBeNull();
  });
});

describe('licitacoes/cnpj · cnpjValido', () => {
  it('valida 14 dígitos', () => {
    expect(cnpjValido('00.503.272/0001-04')).toBe(true);
    expect(cnpjValido('00503272000104')).toBe(true);
  });

  it('rejeita comprimento errado ou vazio', () => {
    expect(cnpjValido('123')).toBe(false);
    expect(cnpjValido('')).toBe(false);
    expect(cnpjValido(null)).toBe(false);
  });
});
