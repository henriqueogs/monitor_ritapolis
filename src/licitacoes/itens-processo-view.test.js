'use strict';

const { montarItensProcesso, montarItensProcessoDeIA } = require('./itens-processo-view');

// Produto no shape do normalizeProdutoRow (produtos-repo)
function prod(over = {}) {
  return {
    id: Math.floor(Math.random() * 1e6),
    item_numero: null,
    lote_numero: null,
    descricao: 'Item',
    descricao_normalizada: null,
    quantidade: null,
    unidade: null,
    valor_unitario_estimado: null,
    valor_total_estimado: null,
    valor_unitario_final: null,
    valor_total_final: null,
    valor_lote_final: null,
    valor_global_final: null,
    valor_final_tipo: null,
    fornecedor_nome: null,
    fornecedor_cnpj: null,
    origem: 'ia_resumo',
    grupo_id: null,
    anexo_origem_id: null,
    valor_final_quarentenado: false,
    valor_final_contexto_empenho: false,
    plausibilidade_valor_processo: null,
    ...over,
  };
}

describe('montarItensProcesso', () => {
  it('separa itens de demanda, resultado por lote e descartados (fixture doc-5)', () => {
    const produtos = [
      prod({ id: 1, item_numero: '3', descricao: 'Cobertura fotográfica', quantidade: 10, unidade: 'diária', valor_total_estimado: 24900 }),
      prod({ id: 2, item_numero: '4', descricao: 'Drone com operador', quantidade: 10, valor_total_estimado: 18000 }),
      prod({
        id: 3, item_numero: '1', lote_numero: '1', descricao: 'EQUIPE DE APOIO', valor_lote_final: 195000,
        valor_final_tipo: 'lote', fornecedor_nome: 'HYAGO E. SANTOS', fornecedor_cnpj: '111', anexo_origem_id: 21,
        valor_final_contexto_empenho: true, plausibilidade_valor_processo: 176186.2, origem: 'ata_resultado',
      }),
      prod({
        id: 4, item_numero: '8', lote_numero: '8', descricao: 'Direct box ativo', valor_lote_final: 4815000,
        valor_final_tipo: 'lote', fornecedor_nome: 'HYAGO E. SANTOS', anexo_origem_id: 21, origem: 'ata_resultado',
      }),
      prod({ id: 5, item_numero: '3301', descricao: '2637 E-mail: gabinete@ritapolis', valor_lote_final: 195000, origem: 'ata_resultado' }),
    ];

    const v = montarItensProcesso(produtos, { valorFinalProcesso: 176186.2, valorFinalOrigem: 'portal_transparencia' });

    expect(v.itens_solicitados.map((i) => i.descricao)).toEqual(['Cobertura fotográfica', 'Drone com operador']);
    expect(v.resultado_lotes).toHaveLength(2);
    expect(v.resultado_lotes[0]).toMatchObject({
      lote_numero: '1', objeto: 'EQUIPE DE APOIO', fornecedor_nome: 'HYAGO E. SANTOS',
      teto_homologado: 195000, contexto_empenho: true, anexo_origem_id: 21,
    });
    expect(v.resultado_lotes[1].lote_numero).toBe('8'); // ordenado por lote
    expect(v.descartados).toHaveLength(1);
    expect(v.descartados[0].motivo).toBe('ruido_parser');
    expect(v.cobertura).toMatchObject({ n_itens: 2, n_lotes: 2, tem_resultado: true, so_demanda: false });
  });

  it('limpa a descrição suja do item de demanda', () => {
    const v = montarItensProcesso(
      [prod({ id: 1, descricao: 'AZITROMICINA 40 MG/ ML E-mail: administracao@ritapolis.mg.gov.br', quantidade: 5 })],
      {}
    );
    expect(v.itens_solicitados[0].descricao).toBe('AZITROMICINA 40 MG/ ML');
    expect(v.descartados).toHaveLength(0);
  });

  it('colapsa duplicata ia_resumo × ata (mesma descrição, prefere a mais rica)', () => {
    const produtos = [
      prod({ id: 10, item_numero: '1', descricao: 'Cobertura fotográfica', descricao_normalizada: 'cobertura fotografica', quantidade: 10, origem: 'ia_resumo' }),
      prod({
        id: 11, item_numero: '1', descricao: 'Cobertura fotográfica', descricao_normalizada: 'cobertura fotografica',
        quantidade: 10, valor_unitario_final: 2000, valor_final_tipo: 'unitario', fornecedor_nome: 'X LTDA', origem: 'ata_resultado',
      }),
    ];
    const v = montarItensProcesso(produtos, {});
    expect(v.itens_solicitados).toHaveLength(1);
    expect(v.itens_solicitados[0].resultado_item).toMatchObject({ valor: 2000, fornecedor_nome: 'X LTDA' });
  });

  it('resultado global vira bloco próprio', () => {
    const v = montarItensProcesso([prod({ id: 1, descricao: 'Serviço único', valor_global_final: 50000, valor_final_tipo: 'global', fornecedor_nome: 'Y' })], {});
    expect(v.resultado_global).toMatchObject({ valor: 50000, fornecedor_nome: 'Y' });
    expect(v.itens_solicitados).toHaveLength(0);
  });

  it('só demanda (sem resultado) marca cobertura.so_demanda', () => {
    const v = montarItensProcesso([prod({ id: 1, descricao: 'Item', quantidade: 3, valor_total_estimado: 100 })], {});
    expect(v.cobertura).toMatchObject({ tem_resultado: false, so_demanda: true, n_lotes: 0 });
  });

  it('entrada vazia', () => {
    const v = montarItensProcesso([], {});
    expect(v).toMatchObject({ itens_solicitados: [], resultado_lotes: [], resultado_global: null, descartados: [] });
  });
});

describe('montarItensProcessoDeIA', () => {
  it('mapeia itens/lotes/global da IA pro mesmo shape do heurístico (CASO doc/5)', () => {
    const v = montarItensProcessoDeIA({
      tem_tabela_itens: true,
      itens_solicitados: [],
      resultado_lotes: [
        {
          lote_numero: '1', objeto: 'EQUIPE DE APOIO', fornecedor_nome: 'HYAGO E. SANTOS PROMOÇÕES-ME',
          fornecedor_cnpj: null, teto_homologado: 195000, trecho_fonte: 'Item: 1 - LOTE 00001 ... R$ 195.000,00',
        },
      ],
      resultado_global: null,
      lacunas: ['cnpj dos fornecedores'],
      confianca: 0.85,
    });

    expect(v.resultado_lotes).toHaveLength(1);
    expect(v.resultado_lotes[0]).toMatchObject({
      lote_numero: '1', objeto: 'EQUIPE DE APOIO', fornecedor_nome: 'HYAGO E. SANTOS PROMOÇÕES-ME', teto_homologado: 195000,
    });
    expect(v.resultado_lotes[0].trecho_fonte).toMatch(/LOTE 00001/);
    expect(v.descartados).toEqual([]);
    expect(v.cobertura).toMatchObject({ origem_estrutura: 'ia', confianca: 0.85, lacunas: ['cnpj dos fornecedores'] });
  });

  it('CASO doc/605: tem_tabela_itens=false vira estrutura vazia com lacunas visíveis', () => {
    const v = montarItensProcessoDeIA({
      tem_tabela_itens: false,
      itens_solicitados: [],
      resultado_lotes: [],
      resultado_global: null,
      lacunas: ['O texto é um cronograma físico-financeiro de medição de obra, não uma lista de itens licitados.'],
      confianca: 0.9,
    });

    expect(v.itens_solicitados).toEqual([]);
    expect(v.resultado_lotes).toEqual([]);
    expect(v.resultado_global).toBeNull();
    expect(v.cobertura.tem_tabela_itens).toBe(false);
    expect(v.cobertura.lacunas[0]).toMatch(/cronograma/);
  });

  it('mapeia resultado_global preservando trecho_fonte', () => {
    const v = montarItensProcessoDeIA({
      tem_tabela_itens: true,
      itens_solicitados: [],
      resultado_lotes: [],
      resultado_global: { descricao: 'Serviço único', valor: 50000, fornecedor_nome: 'X LTDA', fornecedor_cnpj: null, trecho_fonte: 'Valor global R$ 50.000,00' },
      lacunas: [],
      confianca: 0.95,
    });

    expect(v.resultado_global).toMatchObject({ descricao: 'Serviço único', valor: 50000, fornecedor_nome: 'X LTDA' });
    expect(v.resultado_global.trecho_fonte).toBe('Valor global R$ 50.000,00');
  });
});
