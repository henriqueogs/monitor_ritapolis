'use strict';

const { avaliarValorFinal, PISO_VALOR_PLAUSIVEL, TETO_VALOR_PLAUSIVEL } = require('./valores');

describe('licitacoes/valores · avaliarValorFinal', () => {
  describe('valores plausíveis', () => {
    it('aceita um valor típico de contrato municipal', () => {
      expect(avaliarValorFinal(45000)).toEqual({ plausivel: true, motivo: null });
    });

    it('aceita exatamente o piso', () => {
      expect(avaliarValorFinal(PISO_VALOR_PLAUSIVEL).plausivel).toBe(true);
    });

    it('aceita exatamente o teto', () => {
      expect(avaliarValorFinal(TETO_VALOR_PLAUSIVEL).plausivel).toBe(true);
    });
  });

  describe('valores implausíveis (viram "não verificado")', () => {
    it('rejeita R$ 60 — caso real do doc 29 (número capturado da prosa)', () => {
      const r = avaliarValorFinal(60);
      expect(r.plausivel).toBe(false);
      expect(r.motivo).toBe('abaixo_do_piso');
    });

    it('rejeita valor acima do teto municipal', () => {
      const r = avaliarValorFinal(TETO_VALOR_PLAUSIVEL + 1);
      expect(r.plausivel).toBe(false);
      expect(r.motivo).toBe('acima_do_teto');
    });
  });

  describe('valores não aplicáveis (já são lacuna, não há o que validar)', () => {
    it('null', () => {
      expect(avaliarValorFinal(null)).toEqual({ plausivel: true, motivo: null });
    });

    it('zero', () => {
      expect(avaliarValorFinal(0)).toEqual({ plausivel: true, motivo: null });
    });

    it('negativo é implausível', () => {
      expect(avaliarValorFinal(-5).plausivel).toBe(false);
    });

    it('não-numérico é tratado como não aplicável', () => {
      expect(avaliarValorFinal('abc')).toEqual({ plausivel: true, motivo: null });
    });
  });

  describe('piso/teto configuráveis', () => {
    it('respeita um piso customizado', () => {
      expect(avaliarValorFinal(500, { piso: 1000 }).motivo).toBe('abaixo_do_piso');
    });

    it('respeita um teto customizado', () => {
      expect(avaliarValorFinal(2000, { teto: 1000 }).motivo).toBe('acima_do_teto');
    });
  });
});
