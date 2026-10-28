'use strict';

const {
  parseControleCompra,
  normalizarControlePncp,
  consolidarResultadosCompra,
  escolherDocumentoCanonico,
} = require('./pncp-resultados');

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

    it('registro de preços: só o 1º classificado do item conta (classificados e reserva não somam)', () => {
      // fiscal-valores 28/10, achado 1: três resultados SRP somavam 3300 em vez de 1000.
      const itens = [
        {
          numeroItem: 1,
          temResultado: true,
          quantidade: 10,
          resultados: [
            resultado({ ordemClassificacaoSrp: 1, valorTotalHomologado: 1000 }),
            resultado({ ordemClassificacaoSrp: 2, niFornecedor: '99888777000166', valorTotalHomologado: 1100 }),
            resultado({ ordemClassificacaoSrp: 3, niFornecedor: '55444333000122', valorTotalHomologado: 1200 }),
          ],
        },
      ];

      const r = consolidarResultadosCompra(itens);

      expect(r.valor_final).toBe(1000);
      expect(r.fornecedores).toBe(1);
      expect(r.vencedor_cnpj).toBe('11222333000181');
    });

    it('item dividido entre fornecedores: soma só se as quantidades cabem no item', () => {
      const dividido = (qtdA, qtdB) => [
        {
          numeroItem: 1,
          temResultado: true,
          quantidade: 10,
          resultados: [
            resultado({ quantidadeHomologada: qtdA, valorTotalHomologado: 600 }),
            resultado({ niFornecedor: '99888777000166', quantidadeHomologada: qtdB, valorTotalHomologado: 400 }),
          ],
        },
      ];

      expect(consolidarResultadosCompra(dividido(6, 4)).valor_final).toBe(1000);
      expect(consolidarResultadosCompra(dividido(10, 10)).valor_final).toBeNull();
      expect(consolidarResultadosCompra(dividido(undefined, undefined)).valor_final).toBeNull();
    });

    it('temResultado sem resultado válido (vazio ou só cancelado) deixa a compra pendente', () => {
      // fiscal-valores 28/10, achado 2: contava como fechado e subestimava o total.
      const itens = [
        { numeroItem: 1, temResultado: true, resultados: [resultado()] },
        { numeroItem: 2, temResultado: true, resultados: [] },
      ];
      const soCancelado = [
        { numeroItem: 1, temResultado: true, resultados: [resultado()] },
        { numeroItem: 2, temResultado: true, resultados: [resultado({ situacaoCompraItemResultadoId: 2 })] },
      ];

      expect(consolidarResultadosCompra(itens).valor_final).toBeNull();
      expect(consolidarResultadosCompra(soCancelado).valor_final).toBeNull();
    });

    it('valor homologado vazio ou não numérico é desconhecido, não zero', () => {
      // fiscal-valores 28/10, achado 3: Number('') === 0.
      const itens = (valor) => [{ numeroItem: 1, temResultado: true, resultados: [resultado({ valorTotalHomologado: valor })] }];

      expect(consolidarResultadosCompra(itens('')).valor_final).toBeNull();
      expect(consolidarResultadosCompra(itens('abc')).valor_final).toBeNull();
      expect(consolidarResultadosCompra(itens('1500.25')).valor_final).toBe(1500.25);
    });

    it('sem nenhum resultado: tudo null (nada a gravar)', () => {
      const r = consolidarResultadosCompra([{ numeroItem: 1, temResultado: false, resultados: [] }]);

      expect(r).toMatchObject({ vencedor_nome: null, valor_final: null, itens_com_resultado: 0 });
    });
  });

  describe('escolherDocumentoCanonico', () => {
    // fiscal-valores 28/10, achado 4: dois documentos do mesmo processo somavam duas vezes.
    it('prefere o documento local (site) ao que o coletor do PNCP trouxe, e o de menor id', () => {
      const docs = [
        { id: 9, fonte: 'pncp' },
        { id: 7, fonte: 'site_prefeitura' },
        { id: 3, fonte: 'site_prefeitura' },
      ];

      expect(escolherDocumentoCanonico(docs)).toEqual({ id: 3, fonte: 'site_prefeitura' });
    });

    it('sem documento local, usa o do PNCP; lista vazia dá null', () => {
      expect(escolherDocumentoCanonico([{ id: 9, fonte: 'pncp' }])).toEqual({ id: 9, fonte: 'pncp' });
      expect(escolherDocumentoCanonico([])).toBeNull();
    });
  });
});

describe('normalizarControlePncp', () => {
  it('completa o sequencial com zeros até 6 dígitos', () => {
    expect(normalizarControlePncp(' 00000000000191-1-10/2025 ')).toBe('00000000000191-1-000010/2025');
  });

  it('mantém o número já no formato do PNCP', () => {
    expect(normalizarControlePncp('00000000000191-1-000010/2025')).toBe('00000000000191-1-000010/2025');
  });

  it('vazio vira null e formato desconhecido fica como veio', () => {
    expect(normalizarControlePncp('')).toBeNull();
    expect(normalizarControlePncp('abc')).toBe('abc');
  });
});
