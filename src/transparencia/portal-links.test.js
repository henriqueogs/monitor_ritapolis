'use strict';

const {
  buildPortalDespesaLink,
  comLinkPortal,
  PORTAL_TEMPO_REAL_URL,
} = require('./portal-links');

describe('portal-links', () => {
  describe('buildPortalDespesaLink', () => {
    it('monta deep-link de empenho ordinário (caso real validado)', () => {
      const { url, especifico } = buildPortalDespesaLink({
        empenho: '02119-000',
        exercicio: 2026,
        tipo: 'EO - Empenho Ordinário',
      });
      expect(url).toBe(
        'https://pt.ritapolis.mg.gov.br/Relatorios/Detalhamento_Despesa.php?ID8_DESP=02119000&STR_EXR_EXR=2026&CHAR_ID_EMP=1&LG_OP_DESP=N'
      );
      expect(especifico).toBe(true);
    });

    it('usa LG_OP_DESP=S para Ordem de Pagamento (caso real validado)', () => {
      const { url, especifico } = buildPortalDespesaLink({
        empenho: '00001-000',
        exercicio: 2024,
        tipo: 'OP - Ordem de Pagamento',
      });
      expect(url).toContain('ID8_DESP=00001000');
      expect(url).toContain('STR_EXR_EXR=2024');
      expect(url).toContain('LG_OP_DESP=S');
      expect(especifico).toBe(true);
    });

    it.each(['EG - Empenho Global', 'EE - Empenho Estimativo', 'eo', '', null, undefined])(
      'usa LG_OP_DESP=N para tipo %p',
      (tipo) => {
        const { url } = buildPortalDespesaLink({ empenho: '00010-000', exercicio: 2025, tipo });
        expect(url).toContain('LG_OP_DESP=N');
      }
    );

    it('aceita tipo OP com espaços/minúsculas', () => {
      const { url } = buildPortalDespesaLink({
        empenho: '00010-000',
        exercicio: 2025,
        tipo: '  op - ordem de pagamento',
      });
      expect(url).toContain('LG_OP_DESP=S');
    });

    it.each([null, undefined, '', '123', '123456789', '1234-000', '02119000', 'AB119-000', '02119-00'])(
      'cai no fallback genérico para empenho inválido %p',
      (empenho) => {
        const { url, especifico } = buildPortalDespesaLink({ empenho, exercicio: 2026, tipo: 'EO' });
        expect(url).toBe(PORTAL_TEMPO_REAL_URL);
        expect(especifico).toBe(false);
      }
    );

    it.each([null, undefined, NaN, 'abc', 0, 1899, 2101])(
      'cai no fallback genérico para exercício inválido %p',
      (exercicio) => {
        const { url, especifico } = buildPortalDespesaLink({
          empenho: '02119-000',
          exercicio,
          tipo: 'EO',
        });
        expect(url).toBe(PORTAL_TEMPO_REAL_URL);
        expect(especifico).toBe(false);
      }
    );

    it('aceita exercício como string numérica', () => {
      const { url, especifico } = buildPortalDespesaLink({
        empenho: '02119-000',
        exercicio: '2026',
        tipo: 'EO',
      });
      expect(url).toContain('STR_EXR_EXR=2026');
      expect(especifico).toBe(true);
    });
  });

  describe('comLinkPortal', () => {
    it('adiciona campo portal a cada row usando exercicio_orcamento', () => {
      const rows = [
        { empenho: '02119-000', exercicio_orcamento: 2026, tipo: 'EO', valor: 10 },
        { empenho: null, exercicio_orcamento: 2026, tipo: 'EO', valor: 20 },
      ];
      const out = comLinkPortal(rows);
      expect(out).toHaveLength(2);
      expect(out[0].portal.especifico).toBe(true);
      expect(out[0].portal.url).toContain('ID8_DESP=02119000');
      expect(out[0].valor).toBe(10);
      expect(out[1].portal.especifico).toBe(false);
      expect(out[1].portal.url).toBe(PORTAL_TEMPO_REAL_URL);
    });

    it('aceita exercicioKey customizado (ano, no perfil de credor)', () => {
      const out = comLinkPortal([{ empenho: '00001-000', ano: 2024, tipo: 'OP - Ordem de Pagamento' }], {
        exercicioKey: 'ano',
      });
      expect(out[0].portal.url).toContain('STR_EXR_EXR=2024');
      expect(out[0].portal.url).toContain('LG_OP_DESP=S');
    });

    it('não muta as rows originais', () => {
      const row = { empenho: '02119-000', exercicio_orcamento: 2026, tipo: 'EO' };
      comLinkPortal([row]);
      expect(row.portal).toBeUndefined();
    });

    it('retorna lista vazia para entrada não-array', () => {
      expect(comLinkPortal(null)).toEqual([]);
      expect(comLinkPortal(undefined)).toEqual([]);
    });
  });
});
