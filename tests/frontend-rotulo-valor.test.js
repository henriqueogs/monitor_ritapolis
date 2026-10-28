'use strict';

const {
  rotuloValorFinal,
  rotuloValorAgregado,
  isValorHomologado,
  NOTA_REGISTRO_PRECOS,
  NOTA_VALOR_AGREGADO,
} = require('../frontend/lib/rotulo-valor');

describe('rotulo-valor', () => {
  describe('rotuloValorFinal', () => {
    // fiscal-valores 28/10: "homologado" só para o PNCP. Nas demais origens `origem` pode não
    // descrever o valor gravado (ex.: valor da IA numa linha com origem texto_contrato), então
    // o rótulo não afirma "contrato" nem "ata".
    it.each([
      ['pncp_orgaos', 'Valor homologado (2025)'],
      ['texto_contrato', 'Valor final informado (2025)'],
      ['texto_ata', 'Valor final informado (2025)'],
      ['resumo_ai', 'Valor final informado (2025)'],
      ['texto_documento', 'Valor final informado (2025)'],
      ['texto_homologacao', 'Valor final informado (2025)'],
      [null, 'Valor final informado (2025)'],
    ])('origem %s → %s', (origem, esperado) => {
      expect(rotuloValorFinal({ origem, periodo: 2025 })).toBe(esperado);
    });

    it('sem ano conhecido não inventa período', () => {
      expect(rotuloValorFinal({ origem: 'pncp_orgaos', periodo: null })).toBe('Valor homologado');
      expect(rotuloValorFinal({ origem: 'texto_ata', periodo: 'sem_ano' })).toBe('Valor final informado');
    });
  });

  describe('isValorHomologado', () => {
    it('só a origem do resultado do PNCP é homologada', () => {
      expect(isValorHomologado('pncp_orgaos')).toBe(true);
      expect(isValorHomologado('texto_contrato')).toBe(false);
      expect(isValorHomologado(undefined)).toBe(false);
    });
  });

  describe('rotuloValorAgregado', () => {
    it('soma de origens misturadas não se diz homologada e leva o período (§11.1)', () => {
      expect(rotuloValorAgregado('2023–2026')).toBe('Valor final informado (2023–2026)');
      expect(rotuloValorAgregado('')).toBe('Valor final informado');
    });
  });

  it('as notas explicam registro de preços e a mistura de origens sem chamar de gasto', () => {
    expect(NOTA_REGISTRO_PRECOS).toMatch(/registro de preços/i);
    expect(NOTA_REGISTRO_PRECOS).toMatch(/não .*contratado/);
    expect(NOTA_VALOR_AGREGADO).toMatch(/homologado/);
    expect(NOTA_VALOR_AGREGADO).toMatch(/contrato/);
    expect(NOTA_VALOR_AGREGADO).toMatch(/IA/);
    expect(NOTA_VALOR_AGREGADO).toMatch(/não é o valor gasto/i);
  });
});
