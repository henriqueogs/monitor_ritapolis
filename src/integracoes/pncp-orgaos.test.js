'use strict';

jest.mock('axios');
const axios = require('axios');
const { buscarItensComResultados, gerarContratacoesPorCnpj } = require('./pncp-orgaos');

function resposta(data, status = 200) {
  return { status, data };
}

describe('pncp-orgaos', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  describe('buscarItensComResultados', () => {
    it('busca os itens da compra e os resultados só dos itens que têm resultado', async () => {
      // Arrange
      axios.get.mockImplementation(async (url) => {
        if (url.endsWith('/compras/2025/1/itens')) {
          return resposta([
            { numeroItem: 1, temResultado: true, situacaoCompraItem: 2 },
            { numeroItem: 2, temResultado: false, situacaoCompraItem: 4 },
          ]);
        }
        if (url.endsWith('/compras/2025/1/itens/1/resultados')) {
          return resposta([{ niFornecedor: '11222333000181', valorTotalHomologado: 10 }]);
        }
        throw new Error(`URL inesperada ${url}`);
      });

      // Act
      const itens = await buscarItensComResultados({ cnpj: '18557553000105', ano: 2025, sequencial: 1 });

      // Assert
      expect(itens).toEqual([
        {
          numeroItem: 1,
          temResultado: true,
          situacaoCompraItem: 2,
          resultados: [{ niFornecedor: '11222333000181', valorTotalHomologado: 10 }],
        },
        { numeroItem: 2, temResultado: false, situacaoCompraItem: 4, resultados: [] },
      ]);
      expect(axios.get).toHaveBeenCalledTimes(2);
      expect(axios.get.mock.calls[0][0]).toBe(
        'https://pncp.gov.br/api/pncp/v1/orgaos/18557553000105/compras/2025/1/itens'
      );
    });

    it('pagina os itens até vir uma página incompleta', async () => {
      const pagina1 = Array.from({ length: 50 }, (_, i) => ({ numeroItem: i + 1, temResultado: false }));
      axios.get
        .mockResolvedValueOnce(resposta(pagina1))
        .mockResolvedValueOnce(resposta([{ numeroItem: 51, temResultado: false }]));

      const itens = await buscarItensComResultados({ cnpj: '18557553000105', ano: 2025, sequencial: 1 });

      expect(itens).toHaveLength(51);
      expect(axios.get.mock.calls[1][1].params).toMatchObject({ pagina: 2 });
    });

    it('propaga erro de rede (não vira lista vazia silenciosa)', async () => {
      axios.get.mockRejectedValue(new Error('ETIMEDOUT'));

      await expect(
        buscarItensComResultados({ cnpj: '18557553000105', ano: 2025, sequencial: 1 })
      ).rejects.toThrow('ETIMEDOUT');
    });
  });

  describe('gerarContratacoesPorCnpj', () => {
    it('propaga erro da consulta em vez de encerrar em silêncio', async () => {
      axios.get.mockRejectedValue(new Error('PNCP fora'));

      const consumir = async () => {
        for await (const lote of gerarContratacoesPorCnpj('18557553000105', 2025)) {
          void lote;
        }
      };

      await expect(consumir()).rejects.toThrow('PNCP fora');
    });

    it('204 (sem dados) encerra a modalidade sem erro', async () => {
      axios.get.mockResolvedValue(resposta('', 204));
      const lotes = [];

      for await (const lote of gerarContratacoesPorCnpj('18557553000105', 2025)) {
        lotes.push(lote);
      }

      expect(lotes).toEqual([]);
    });
  });
});
