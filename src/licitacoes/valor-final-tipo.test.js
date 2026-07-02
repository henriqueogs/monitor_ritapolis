'use strict';

const {
  detectarTipoValorEmTexto,
  extrairLoteNumero,
  inferirValorFinalTipoResultado,
} = require('./valor-final-tipo');

describe('valor-final-tipo', () => {
  describe('detectarTipoValorEmTexto', () => {
    it('detecta lote com e sem acento/caixa', () => {
      expect(detectarTipoValorEmTexto('LOTE 00008')).toBe('lote');
      expect(detectarTipoValorEmTexto('Valor final do lote 3')).toBe('lote');
    });

    it('detecta global', () => {
      expect(detectarTipoValorEmTexto('VALOR GLOBAL DA PROPOSTA')).toBe('global');
    });

    it('retorna null sem sinal', () => {
      expect(detectarTipoValorEmTexto('Direct Box ativo')).toBeNull();
      expect(detectarTipoValorEmTexto(null)).toBeNull();
    });
  });

  describe('extrairLoteNumero', () => {
    it('extrai número do lote com zeros à esquerda', () => {
      expect(extrairLoteNumero('NEGOCIACAO - Item 8 - LOTE 00008 - Fornecedor X')).toBe('8');
      expect(extrairLoteNumero('Lote nº 03')).toBe('3');
    });

    it('retorna null sem lote', () => {
      expect(extrairLoteNumero('Item 8 - Direct Box')).toBeNull();
      expect(extrairLoteNumero('')).toBeNull();
    });
  });

  describe('inferirValorFinalTipoResultado (precedência)', () => {
    it('CASO REAL doc/5 item 8: tipoParser=lote vence quantidade', () => {
      expect(
        inferirValorFinalTipoResultado({
          tipoParser: 'lote',
          quantidade: 8,
          trechos: ['Direct Box ativo'],
          valorFinal: 4815000,
        })
      ).toBe('lote');
    });

    it('lote_numero vence quantidade', () => {
      expect(
        inferirValorFinalTipoResultado({
          loteNumero: '8',
          quantidade: 8,
          trechos: ['Direct Box ativo'],
        })
      ).toBe('lote');
    });

    it('trecho com LOTE vence quantidade', () => {
      expect(
        inferirValorFinalTipoResultado({
          quantidade: 8,
          trechos: ['Direct Box ativo', 'NEGOCIACAO - Item 8 - LOTE 00008 - Valor final R$ 4.815.000,00'],
        })
      ).toBe('lote');
    });

    it('sinal global nos trechos vence quantidade', () => {
      expect(
        inferirValorFinalTipoResultado({
          quantidade: 2,
          trechos: ['Proposta VALOR GLOBAL R$ 100.000,00'],
        })
      ).toBe('global');
    });

    it('sem sinal + quantidade → unitario (comportamento atual preservado)', () => {
      expect(
        inferirValorFinalTipoResultado({
          quantidade: 8,
          trechos: ['Direct Box ativo'],
          valorFinal: 450,
        })
      ).toBe('unitario');
    });

    it('serviço/obra sem quantidade e valor ≥ 1000 → global (heurística migrada)', () => {
      expect(
        inferirValorFinalTipoResultado({
          trechos: ['Prestação de serviço de reforma do prédio'],
          valorFinal: 50000,
        })
      ).toBe('global');
    });

    it('sem nenhum sinal → unitario', () => {
      expect(inferirValorFinalTipoResultado({ trechos: ['Caneta azul'], valorFinal: 2 })).toBe('unitario');
    });

    it('tipoParser unitario não força — sinais de lote ainda vencem', () => {
      expect(
        inferirValorFinalTipoResultado({
          tipoParser: 'unitario',
          loteNumero: '3',
          quantidade: 10,
          trechos: ['COBERTURA FOTOGRÁFICA'],
        })
      ).toBe('lote');
    });
  });
});
