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

  it('mascara CPF sem pontuação quando rotulado, e-mail e telefone brasileiro', () => {
    expect(mascararCpf('CPF: 12345678909')).toBe(`CPF: ${CPF_MASCARADO}`);
    expect(mascararCpf('contato fulano.silva@exemplo.com.br agora')).toBe(
      'contato [e-mail oculto] agora'
    );
    expect(mascararCpf('ligar (35) 99876-5432 ou 35 3333-4444')).toBe(
      'ligar [telefone oculto] ou [telefone oculto]'
    );
  });

  it('não confunde número de processo, empenho ou valor com telefone/CPF', () => {
    const texto = 'Processo 2025/00123, empenho 2025NE000456, R$ 12345678909,00 e ano 2025';
    expect(mascararCpf(texto)).toBe(texto);
  });

  it('aceita null/undefined sem lançar', () => {
    expect(mascararCpf(null)).toBe('');
    expect(mascararCpf(undefined)).toBe('');
  });
});
