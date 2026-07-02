'use strict';

const {
  avaliarValorFinal,
  extrairValorFinalEstruturado,
  avaliarValorItemContraProcesso,
  FATOR_MAX_ITEM_VS_PROCESSO,
  PISO_VALOR_PLAUSIVEL,
  TETO_VALOR_PLAUSIVEL,
} = require('./valores');

describe('licitacoes/valores · extrairValorFinalEstruturado', () => {
  it('prioriza na ordem da exibição: total_item > lote > global > unit×qtd > unitário', () => {
    expect(extrairValorFinalEstruturado({ valor_total_final: 30, valor_lote_final: 20, valor_global_final: 10 })).toEqual({
      campo: 'valor_total_final',
      tipo: 'total_item',
      valor: 30,
    });
    expect(extrairValorFinalEstruturado({ valor_lote_final: 20, valor_global_final: 10 })).toEqual({
      campo: 'valor_lote_final',
      tipo: 'lote',
      valor: 20,
    });
    expect(extrairValorFinalEstruturado({ valor_global_final: 10 })).toEqual({
      campo: 'valor_global_final',
      tipo: 'global',
      valor: 10,
    });
    expect(extrairValorFinalEstruturado({ valor_unitario_final: 5, quantidade: 4 })).toEqual({
      campo: 'valor_total_final_calculado',
      tipo: 'total_item',
      valor: 20,
    });
    expect(extrairValorFinalEstruturado({ valor_unitario_final: 5 })).toEqual({
      campo: 'valor_unitario_final',
      tipo: 'unitario',
      valor: 5,
    });
  });

  it('retorna null sem valor final', () => {
    expect(extrairValorFinalEstruturado({})).toBeNull();
    expect(extrairValorFinalEstruturado({ valor_unitario_estimado: 10 })).toBeNull();
  });
});

describe('licitacoes/valores · avaliarValorItemContraProcesso', () => {
  it('CASO doc/5: item de R$ 4.815.000 num processo de R$ 176.186,20 é implausível', () => {
    const r = avaliarValorItemContraProcesso({ valorItem: 4815000, valorFinalProcesso: 176186.2 });
    expect(r.plausivel).toBe(false);
    expect(r.motivo).toBe('item_excede_valor_processo');
    expect(r.razao).toBeCloseTo(27.33, 1);
  });

  it('item igual ao processo é plausível (folga de 5%)', () => {
    expect(avaliarValorItemContraProcesso({ valorItem: 176186.2, valorFinalProcesso: 176186.2 }).plausivel).toBe(true);
    expect(
      avaliarValorItemContraProcesso({ valorItem: 176186.2 * FATOR_MAX_ITEM_VS_PROCESSO, valorFinalProcesso: 176186.2 })
        .plausivel
    ).toBe(true);
  });

  it('1.06× já é implausível', () => {
    expect(avaliarValorItemContraProcesso({ valorItem: 106, valorFinalProcesso: 100 }).plausivel).toBe(false);
  });

  it('sem valor do processo (null/0) → plausível, nunca inventa', () => {
    expect(avaliarValorItemContraProcesso({ valorItem: 999999, valorFinalProcesso: null }).plausivel).toBe(true);
    expect(avaliarValorItemContraProcesso({ valorItem: 999999, valorFinalProcesso: 0 }).plausivel).toBe(true);
    expect(avaliarValorItemContraProcesso({ valorItem: null, valorFinalProcesso: 100 }).plausivel).toBe(true);
  });
});

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
