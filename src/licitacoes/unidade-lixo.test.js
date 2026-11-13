'use strict';

const { ehUnidadeLixo } = require('./unidade-lixo');

describe('ehUnidadeLixo', () => {
  it.each(['|', '| BDI 1', '| -', '| S', '-', '| Objeto', '12/18/25 |', 'R$0.00', '0.00%', ''])(
    'trata %p como lixo de parser',
    valor => {
      expect(ehUnidadeLixo(valor)).toBe(true);
    }
  );

  it('trata parágrafo de texto no lugar da unidade como lixo', () => {
    expect(
      ehUnidadeLixo(
        'O solo para a execução dos reaterros será proveniente de áreas de empréstimo ou da própria escavação'
      )
    ).toBe(true);
  });

  it.each([
    'UN',
    'Un.',
    'Kg',
    'M2',
    'M³',
    'm',
    'Unidade',
    'PÇ',
    'Garrafa de 500 ml',
    'blocos com 100 folhas',
    'Frasco de 900 ml',
    'TELEFONE',
    'H',
  ])('mantém unidade legítima %p', valor => {
    expect(ehUnidadeLixo(valor)).toBe(false);
  });

  it('null/undefined não são lixo (já estão vazios)', () => {
    expect(ehUnidadeLixo(null)).toBe(false);
    expect(ehUnidadeLixo(undefined)).toBe(false);
  });
});
