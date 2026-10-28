'use strict';

const { sincronizarVencedoresPncp, statusDaSincronizacao } = require('./pncp-vencedores');

const CONTROLE = '18557553000105-1-000001/2025';

function itemFechado(cnpj, valor) {
  return {
    numeroItem: 1,
    temResultado: true,
    resultados: [{ niFornecedor: cnpj, nomeRazaoSocialFornecedor: 'Fornecedor A', valorTotalHomologado: valor }],
  };
}

function criarDeps(sobrescrever = {}) {
  return {
    gerarContratacoesPorCnpj: async function* () {
      yield { modalidade: 6, items: [{ numeroControlePNCP: CONTROLE }, { numeroControlePNCP: 'sem-doc-local' }] };
    },
    extrairNumeroPncp: (item) => item.numeroControlePNCP,
    listarDocumentosPorNumeroPncp: jest.fn((numero) =>
      numero === CONTROLE ? [{ id: 50, fonte: 'pncp' }, { id: 42, fonte: 'site_prefeitura' }] : []
    ),
    buscarItensComResultados: jest.fn(async () => [itemFechado('11222333000181', 1500)]),
    gravarResultadoPncp: jest.fn(() => 1),
    ...sobrescrever,
  };
}

describe('sincronizarVencedoresPncp', () => {
  it('grava vencedor e valor homologado só das compras que casam com documento local', async () => {
    // Arrange
    const deps = criarDeps();

    // Act
    const stats = await sincronizarVencedoresPncp({ cnpjs: ['18557553000105'], anos: [2025] }, deps);

    // Assert
    expect(deps.buscarItensComResultados).toHaveBeenCalledTimes(1);
    expect(deps.buscarItensComResultados).toHaveBeenCalledWith({
      cnpj: '18557553000105',
      ano: 2025,
      sequencial: 1,
    });
    // Grava só no documento canônico (o do site), nunca nos dois do mesmo processo.
    expect(deps.gravarResultadoPncp).toHaveBeenCalledTimes(1);
    expect(deps.gravarResultadoPncp).toHaveBeenCalledWith(42, {
      vencedor_nome: 'Fornecedor A',
      vencedor_cnpj: '11222333000181',
      multiplos_fornecedores: false,
      valor_final: 1500,
      numero_pncp: CONTROLE,
      data_resultado: null,
    });
    expect(stats).toEqual({
      consultadas: 2,
      correspondencias: 1,
      atualizadas: 1,
      sem_resultado: 0,
      implausiveis: 0,
      erros: 0,
      falhas: [],
    });
  });

  it('compra ainda sem resultado não grava nada', async () => {
    const deps = criarDeps({
      buscarItensComResultados: jest.fn(async () => [{ numeroItem: 1, temResultado: false, situacaoCompraItem: 1 }]),
    });

    const stats = await sincronizarVencedoresPncp({ cnpjs: ['18557553000105'], anos: [2025] }, deps);

    expect(deps.gravarResultadoPncp).not.toHaveBeenCalled();
    expect(stats.sem_resultado).toBe(1);
  });

  it('vencedor sem valor homologado conhecido não grava (origem do valor não mistura)', async () => {
    const deps = criarDeps({
      buscarItensComResultados: jest.fn(async () => [itemFechado('11222333000181', null)]),
    });

    const stats = await sincronizarVencedoresPncp({ cnpjs: ['18557553000105'], anos: [2025] }, deps);

    expect(deps.gravarResultadoPncp).not.toHaveBeenCalled();
    expect(stats.sem_resultado).toBe(1);
  });

  it('vários fornecedores: grava o total e sinaliza para apagar o vencedor único antigo', async () => {
    const deps = criarDeps({
      buscarItensComResultados: jest.fn(async () => [
        itemFechado('11222333000181', 1000),
        { ...itemFechado('99888777000166', 500), numeroItem: 2 },
      ]),
    });

    await sincronizarVencedoresPncp({ cnpjs: ['18557553000105'], anos: [2025] }, deps);

    expect(deps.gravarResultadoPncp).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ vencedor_nome: null, multiplos_fornecedores: true, valor_final: 1500 })
    );
  });

  it('valor homologado fora da faixa plausível não grava (respeita o gate de valores)', async () => {
    // fiscal-valores 28/10: sem isso a sincronização semanal desfazia o aplicar-gate-valores.
    const deps = criarDeps({
      buscarItensComResultados: jest.fn(async () => [itemFechado('11222333000181', 1e12)]),
    });

    const stats = await sincronizarVencedoresPncp({ cnpjs: ['18557553000105'], anos: [2025] }, deps);

    expect(deps.gravarResultadoPncp).not.toHaveBeenCalled();
    expect(stats).toMatchObject({ atualizadas: 0, implausiveis: 1 });
  });

  it('dry-run conta o que seria gravado sem gravar', async () => {
    const deps = criarDeps();

    const stats = await sincronizarVencedoresPncp(
      { cnpjs: ['18557553000105'], anos: [2025], dryRun: true },
      deps
    );

    expect(deps.gravarResultadoPncp).not.toHaveBeenCalled();
    expect(stats.atualizadas).toBe(1);
  });

  it('erro na consulta de um órgão/ano é contado e não interrompe os demais', async () => {
    let chamada = 0;
    const deps = criarDeps({
      gerarContratacoesPorCnpj: async function* () {
        chamada += 1;
        if (chamada === 1) {throw new Error('PNCP fora');}
        yield { modalidade: 6, items: [{ numeroControlePNCP: CONTROLE }] };
      },
    });

    const stats = await sincronizarVencedoresPncp({ cnpjs: ['18557553000105'], anos: [2024, 2025] }, deps);

    expect(stats.erros).toBe(1);
    expect(stats.atualizadas).toBe(1);
    expect(stats.falhas).toEqual([{ cnpj: '18557553000105', ano: 2024, erro: 'PNCP fora' }]);
  });

  it('erro ao buscar resultados de uma compra é contado e segue para a próxima', async () => {
    const deps = criarDeps({ buscarItensComResultados: jest.fn(async () => { throw new Error('timeout'); }) });

    const stats = await sincronizarVencedoresPncp({ cnpjs: ['18557553000105'], anos: [2025] }, deps);

    expect(stats).toMatchObject({ correspondencias: 1, atualizadas: 0, erros: 1 });
  });
});

describe('statusDaSincronizacao', () => {
  it('erro quando todas as consultas falharam (nada chegou do PNCP)', () => {
    expect(statusDaSincronizacao({ consultadas: 0, erros: 4 })).toBe('erro');
  });

  it('ok quando o PNCP respondeu, mesmo com alguma falha parcial', () => {
    expect(statusDaSincronizacao({ consultadas: 3, erros: 1 })).toBe('ok');
  });

  it('ok quando o PNCP respondeu sem contratações (órgão não publicou)', () => {
    expect(statusDaSincronizacao({ consultadas: 0, erros: 0 })).toBe('ok');
  });
});
