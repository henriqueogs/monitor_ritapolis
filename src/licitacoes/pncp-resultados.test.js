'use strict';

const { parseControleCompra, consolidarResultadosCompra } = require('./pncp-resultados');

function resultado(campos = {}) {
  return {
    niFornecedor: '11222333000181',
    nomeRazaoSocialFornecedor: 'Fornecedor A Ltda',
    valorTotalHomologado: 1000,
    dataResultado: '2025-03-10T00:00:00',
    situacaoCompraItemResultadoId: 1,
    ...campos,
  };
}

describe('pncp-resultados', () => {
  describe('parseControleCompra', () => {
    it('extrai CNPJ, ano e sequencial do número de controle da compra', () => {
      expect(parseControleCompra('18557553000105-1-000001/2025')).toEqual({
        cnpj: '18557553000105',
        ano: 2025,
        sequencial: 1,
      });
    });

    it('retorna null quando o controle é inválido ou não é de compra', () => {
      expect(parseControleCompra('18557553000105-2-000004/2025')).toBeNull();
      expect(parseControleCompra('qualquer coisa')).toBeNull();
      expect(parseControleCompra(null)).toBeNull();
    });
  });

  describe('consolidarResultadosCompra', () => {
    it('um fornecedor em todos os itens: vencedor único e valor homologado somado', () => {
      // Arrange
      const itens = [
        { numeroItem: 1, temResultado: true, resultados: [resultado({ valorTotalHomologado: 1000 })] },
        {
          numeroItem: 2,
          temResultado: true,
          resultados: [resultado({ valorTotalHomologado: 250.5, dataResultado: '2025-03-12T00:00:00' })],
        },
      ];

      // Act
      const r = consolidarResultadosCompra(itens);

      // Assert
      expect(r).toEqual({
        vencedor_nome: 'Fornecedor A Ltda',
        vencedor_cnpj: '11222333000181',
        valor_final: 1250.5,
        data_resultado: '2025-03-12',
        itens: 2,
        itens_com_resultado: 2,
        fornecedores: 1,
      });
    });

    it('vários fornecedores: sem vencedor único, valor total da compra mantido', () => {
      const itens = [
        { numeroItem: 1, temResultado: true, resultados: [resultado()] },
        {
          numeroItem: 2,
          temResultado: true,
          resultados: [resultado({ niFornecedor: '99888777000166', nomeRazaoSocialFornecedor: 'B' })],
        },
      ];

      const r = consolidarResultadosCompra(itens);

      expect(r.vencedor_nome).toBeNull();
      expect(r.vencedor_cnpj).toBeNull();
      expect(r.valor_final).toBe(2000);
      expect(r.fornecedores).toBe(2);
    });

    it('item ainda em andamento: processo não fechado, nada é gravado (soma parcial subestimaria)', () => {
      const itens = [
        { numeroItem: 1, temResultado: true, situacaoCompraItem: 2, resultados: [resultado()] },
        { numeroItem: 2, temResultado: false, situacaoCompraItem: 1, resultados: [] },
      ];

      const r = consolidarResultadosCompra(itens);

      expect(r.valor_final).toBeNull();
      expect(r.vencedor_nome).toBeNull();
      expect(r.itens_com_resultado).toBe(1);
    });

    it('item deserto ou fracassado fecha sem valor: o processo conta como concluído', () => {
      const itens = [
        { numeroItem: 1, temResultado: true, situacaoCompraItem: 2, resultados: [resultado()] },
        { numeroItem: 2, temResultado: false, situacaoCompraItem: 4, resultados: [] },
      ];

      const r = consolidarResultadosCompra(itens);

      expect(r.valor_final).toBe(1000);
      expect(r.vencedor_nome).toBe('Fornecedor A Ltda');
    });

    it('ignora resultado cancelado e não trata valor ausente como zero', () => {
      const itens = [
        {
          numeroItem: 1,
          temResultado: true,
          resultados: [
            resultado({ situacaoCompraItemResultadoId: 2, niFornecedor: '99888777000166' }),
            resultado({ valorTotalHomologado: null }),
          ],
        },
      ];

      const r = consolidarResultadosCompra(itens);

      expect(r.fornecedores).toBe(1);
      expect(r.vencedor_cnpj).toBe('11222333000181');
      expect(r.valor_final).toBeNull();
    });

    it('sem nenhum resultado: tudo null (nada a gravar)', () => {
      const r = consolidarResultadosCompra([{ numeroItem: 1, temResultado: false, resultados: [] }]);

      expect(r).toMatchObject({ vencedor_nome: null, valor_final: null, itens_com_resultado: 0 });
    });
  });
});
