'use strict';

const { mascararCpf, CPF_MASCARADO } = require('./privacidade');

describe('mascararCpf (fiscal-privacidade L1)', () => {
  it('mascara CPF completo em qualquer posição do texto', () => {
    expect(mascararCpf('João, CPF 123.456.789-09, e 987.654.321-00.')).toBe(
      `João, CPF ${CPF_MASCARADO}, e ${CPF_MASCARADO}.`
    );
  });

  it('não mexe em CNPJ, números de processo, valores nem CPF já mascarado', () => {
    const texto = 'CNPJ 12.345.678/0001-90, PP-001/2025, R$ 1.234.567,89, ***.456.789-**';
    expect(mascararCpf(texto)).toBe(texto);
  });

  it('aceita null/undefined sem lançar', () => {
    expect(mascararCpf(null)).toBe('');
    expect(mascararCpf(undefined)).toBe('');
  });
});
