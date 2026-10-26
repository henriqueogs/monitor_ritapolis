'use strict';

jest.mock('../db/produtos-repo', () => ({ getLicitacaoProdutosByDocumentoId: jest.fn() }));
jest.mock('../db/credores-repo', () => ({ credorTemPerfil: jest.fn() }));

const { getLicitacaoProdutosByDocumentoId } = require('../db/produtos-repo');
const { credorTemPerfil } = require('../db/credores-repo');
const { getLicitacaoProdutosComPerfil } = require('./licitacao-produtos-service');

describe('licitacao-produtos-service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('marca o vencedor com fornecedor_tem_perfil usando credorTemPerfil', () => {
    // Arrange
    getLicitacaoProdutosByDocumentoId.mockReturnValue({
      dados: [{ id: 1 }],
      estrutura: {
        resultado_lotes: [{ fornecedor_nome: 'A', fornecedor_cnpj: '42799163000126' }],
        resultado_global: null,
      },
    });
    credorTemPerfil.mockReturnValue(false);

    // Act
    const r = getLicitacaoProdutosComPerfil(7);

    // Assert
    expect(getLicitacaoProdutosByDocumentoId).toHaveBeenCalledWith(7);
    expect(credorTemPerfil).toHaveBeenCalledWith('42799163000126');
    expect(r.estrutura.resultado_lotes[0].fornecedor_tem_perfil).toBe(false);
    expect(r.dados).toEqual([{ id: 1 }]);
  });

  it('sem estrutura devolve o resultado do repositório inalterado', () => {
    getLicitacaoProdutosByDocumentoId.mockReturnValue({ dados: [] });

    expect(getLicitacaoProdutosComPerfil(7)).toEqual({ dados: [] });
    expect(credorTemPerfil).not.toHaveBeenCalled();
  });
});
