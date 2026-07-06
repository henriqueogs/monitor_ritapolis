'use strict';

const { validateItensProcesso } = require('./itens-processo-contract');

// Payload mínimo válido reutilizado nos testes
function payload(over = {}) {
  return {
    tem_tabela_itens: true,
    itens_solicitados: [],
    resultado_lotes: [],
    resultado_global: null,
    lacunas: [],
    confianca: 0.8,
    ...over,
  };
}

describe('itens-processo-contract', () => {
  it('aceita payload mínimo válido', () => {
    const r = validateItensProcesso(payload());
    expect(r.tem_tabela_itens).toBe(true);
    expect(r.itens_solicitados).toEqual([]);
    expect(r.resultado_global).toBeNull();
  });

  it('CASO doc/605: tem_tabela_itens=false com lacuna explícita (cronograma, não itens)', () => {
    const r = validateItensProcesso(
      payload({
        tem_tabela_itens: false,
        lacunas: ['O texto é um cronograma físico-financeiro de medição de obra, não uma lista de itens licitados.'],
        confianca: 0.9,
      })
    );
    expect(r.tem_tabela_itens).toBe(false);
    expect(r.itens_solicitados).toEqual([]);
    expect(r.lacunas[0]).toMatch(/cronograma/);
  });

  it('valida item solicitado com trecho_fonte obrigatório', () => {
    const r = validateItensProcesso(
      payload({
        itens_solicitados: [
          {
            item_numero: '1',
            descricao: 'Cobertura fotográfica',
            quantidade: 10,
            unidade: 'diária',
            valor_estimado: 24900,
            trecho_fonte: 'Item 1 - Cobertura fotográfica - 10 diárias - R$ 24.900,00',
          },
        ],
      })
    );
    expect(r.itens_solicitados[0]).toMatchObject({ descricao: 'Cobertura fotográfica', quantidade: 10 });
  });

  it('rejeita item sem trecho_fonte (não pode inventar sem origem)', () => {
    expect(() =>
      validateItensProcesso(
        payload({
          itens_solicitados: [{ descricao: 'Item sem fonte', quantidade: 1 }],
        })
      )
    ).toThrow(/trecho_fonte/);
  });

  it('valida resultado_lotes com teto homologado (CASO doc/5 EQUIPE DE APOIO)', () => {
    const r = validateItensProcesso(
      payload({
        resultado_lotes: [
          {
            lote_numero: '1',
            objeto: 'EQUIPE DE APOIO',
            fornecedor_nome: 'HYAGO E. SANTOS PROMOÇÕES-ME',
            fornecedor_cnpj: null,
            teto_homologado: 195000,
            trecho_fonte: 'Item: 1 - LOTE 00001 ... HYAGO E. SANTOS PROMOÇÕES-ME R$ 195.000,00 100,00 Selecionado',
          },
        ],
      })
    );
    expect(r.resultado_lotes[0].teto_homologado).toBe(195000);
  });

  it('coage quantidade/valor em formato BR ("12.400,00" -> 12400)', () => {
    const r = validateItensProcesso(
      payload({
        itens_solicitados: [
          {
            descricao: 'Item X',
            quantidade: '12.400,00',
            valor_estimado: '1.234,56',
            trecho_fonte: 'fonte',
          },
        ],
      })
    );
    expect(r.itens_solicitados[0].quantidade).toBe(12400);
    expect(r.itens_solicitados[0].valor_estimado).toBe(1234.56);
  });

  it('resultado_global aceita objeto ou null', () => {
    const r = validateItensProcesso(
      payload({
        resultado_global: {
          descricao: 'Serviço único',
          valor: 50000,
          fornecedor_nome: 'X LTDA',
          fornecedor_cnpj: null,
          trecho_fonte: 'Valor global R$ 50.000,00',
        },
      })
    );
    expect(r.resultado_global.valor).toBe(50000);
  });

  it('rejeita confianca fora de [0,1]', () => {
    expect(() => validateItensProcesso(payload({ confianca: 1.5 }))).toThrow();
    expect(() => validateItensProcesso(payload({ confianca: -0.1 }))).toThrow();
  });

  it('limita itens_solicitados e resultado_lotes a um máximo razoável', () => {
    const muitos = Array.from({ length: 250 }, (_, i) => ({
      item_numero: String(i),
      descricao: `Item ${i}`,
      trecho_fonte: 'fonte',
    }));
    expect(() => validateItensProcesso(payload({ itens_solicitados: muitos }))).toThrow();
  });

  it('trunca trecho_fonte excedente em vez de rejeitar o resultado inteiro', () => {
    const r = validateItensProcesso(
      payload({
        itens_solicitados: [
          { descricao: 'Item X', trecho_fonte: 'A'.repeat(900) },
        ],
      })
    );
    expect(r.itens_solicitados[0].trecho_fonte.length).toBeLessThanOrEqual(700);
    expect(r.itens_solicitados[0].trecho_fonte).toMatch(/…$/);
  });

  it('coage item_numero/lote_numero number puro pra string (IA às vezes manda 1 em vez de "1")', () => {
    const r = validateItensProcesso(
      payload({
        itens_solicitados: [{ item_numero: 1, descricao: 'Item', trecho_fonte: 'fonte' }],
        resultado_lotes: [{ lote_numero: 2, objeto: 'X', trecho_fonte: 'fonte' }],
      })
    );
    expect(r.itens_solicitados[0].item_numero).toBe('1');
    expect(r.resultado_lotes[0].lote_numero).toBe('2');
  });

  it('trunca fornecedor_cnpj/lote_numero excedentes (ex.: IA escreveu sentinela em campo curto)', () => {
    const r = validateItensProcesso(
      payload({
        resultado_lotes: [
          {
            lote_numero: 'Não especificado no trecho fornecido',
            objeto: 'Objeto X',
            fornecedor_cnpj: 'Não especificado no trecho fornecido',
            trecho_fonte: 'fonte',
          },
        ],
      })
    );
    expect(r.resultado_lotes[0].lote_numero.length).toBeLessThanOrEqual(20);
    expect(r.resultado_lotes[0].fornecedor_cnpj.length).toBeLessThanOrEqual(20);
  });

  it('aceita null nos arrays (IA às vezes manda null em vez de [])', () => {
    const r = validateItensProcesso(
      payload({ itens_solicitados: null, resultado_lotes: null, lacunas: null })
    );
    expect(r.itens_solicitados).toEqual([]);
    expect(r.resultado_lotes).toEqual([]);
    expect(r.lacunas).toEqual([]);
  });

  it('mensagem de erro identifica o campo problemático', () => {
    try {
      validateItensProcesso(payload({ confianca: 'alta' }));
      throw new Error('deveria ter lançado');
    } catch (err) {
      expect(err.message).toMatch(/confianca/);
    }
  });
});
