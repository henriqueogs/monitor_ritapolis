'use strict';

const {
  paraFormatoBr,
  paraFormatoIso,
  montarRegistroDespesa,
} = require('./portal-transparencia-thread-http');

describe('portal-transparencia-thread-http', () => {
  describe('montarRegistroDespesa', () => {
    const item = {
      empenho: '00542-000',
      tipo: 'EO',
      dataEmpenho: '25/02/2026',
      dataLiquidacao: '03/03/2026',
      dataPagamento: '04/03/2026',
      valor: 30754.71,
      credorNomeParcial: 'RLM',
    };
    const detalhe = {
      credor: 'RLM PEÇAS - CPF/CNPJ: 18.855.014/0001-52',
      unidade: 'SECRETARIA DE TRANSPORTE',
      historico: 'PEÇAS',
      licitacao: '00005225 / 0',
      modalidade: 'Adesão a Registro de Preços - 00122025',
      itens: [{ item: 1, produto: 'ENGRENAGEM' }],
    };

    it('leva licitação, modalidade e itens do detalhe para o registro (antes se perdiam)', () => {
      const r = montarRegistroDespesa({ item, exercicio: 2026, detalhe });
      expect(r).toMatchObject({
        empenho: '00542-000',
        exercicio: 2026,
        dataDoEmpenho: '2026-02-25',
        licitacao: '00005225 / 0',
        modalidade: 'Adesão a Registro de Preços - 00122025',
        unidade: 'SECRETARIA DE TRANSPORTE',
      });
      expect(r.itens).toEqual([{ item: 1, produto: 'ENGRENAGEM' }]);
    });

    it('sem licitação/itens na página, os campos ficam indefinidos e o credor cai no nome do CSV', () => {
      const r = montarRegistroDespesa({ item, exercicio: 2026, detalhe: {} });
      expect(r.licitacao).toBeUndefined();
      expect(r.itens).toBeUndefined();
      expect(r.credor).toBe('RLM');
    });
  });

  describe('paraFormatoBr', () => {
    it('converte ISO (aaaa-mm-dd) para o formato do formulário (dd/mm/aaaa)', () => {
      expect(paraFormatoBr('2025-01-07')).toBe('07/01/2025');
    });
  });

  describe('paraFormatoIso', () => {
    it('converte dd/mm/aaaa para ISO', () => {
      expect(paraFormatoIso('07/01/2025')).toBe('2025-01-07');
    });

    it('retorna null para valor vazio', () => {
      expect(paraFormatoIso('')).toBeNull();
      expect(paraFormatoIso(null)).toBeNull();
    });
  });
});
