'use strict';

const { rotuloValorHomologado, NOTA_REGISTRO_PRECOS } = require('../frontend/lib/rotulo-valor');

describe('rotulo-valor', () => {
  describe('rotuloValorHomologado', () => {
    it('diz que é o valor homologado e traz o ano do processo (§11.1)', () => {
      expect(rotuloValorHomologado(2025)).toBe('Valor homologado (2025)');
    });

    it('aceita um intervalo já formatado para somas de vários anos', () => {
      expect(rotuloValorHomologado('2023–2026')).toBe('Valor homologado (2023–2026)');
    });

    it('sem ano conhecido não inventa período', () => {
      expect(rotuloValorHomologado(null)).toBe('Valor homologado');
      expect(rotuloValorHomologado('')).toBe('Valor homologado');
    });
  });

  it('a nota de registro de preços avisa que o valor é o teto da ata, não o contratado', () => {
    expect(NOTA_REGISTRO_PRECOS).toMatch(/registro de preços/i);
    expect(NOTA_REGISTRO_PRECOS).toMatch(/ata/);
    expect(NOTA_REGISTRO_PRECOS).toMatch(/não .*contratado/);
  });
});
