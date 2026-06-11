'use strict';

const { derivarVencedorDeProdutos } = require('./vencedor');

describe('licitacoes/vencedor · derivarVencedorDeProdutos', () => {
  it('retorna null quando não há produtos com fornecedor', () => {
    expect(derivarVencedorDeProdutos([])).toBeNull();
    expect(derivarVencedorDeProdutos([{ fornecedor_nome: null, fornecedor_cnpj: null }])).toBeNull();
  });

  it('promove o único fornecedor como vencedor', () => {
    const r = derivarVencedorDeProdutos([
      { fornecedor_nome: 'ALFA LTDA', fornecedor_cnpj: '11.111.111/0001-11', valor_total_final: 100 },
      { fornecedor_nome: 'ALFA LTDA', fornecedor_cnpj: '11.111.111/0001-11', valor_total_final: 50 },
    ]);
    expect(r.vencedor_nome).toBe('ALFA LTDA');
    expect(r.vencedor_cnpj).toBe('11.111.111/0001-11');
    expect(r.multiplos).toBe(false);
    expect(r.n_fornecedores).toBe(1);
  });

  it('escolhe o fornecedor dominante por valor quando há vários', () => {
    const r = derivarVencedorDeProdutos([
      { fornecedor_nome: 'ALFA', fornecedor_cnpj: '11.111.111/0001-11', valor_total_final: 100 },
      { fornecedor_nome: 'BETA', fornecedor_cnpj: '22.222.222/0001-22', valor_total_final: 900 },
      { fornecedor_nome: 'BETA', fornecedor_cnpj: '22.222.222/0001-22', valor_total_final: 100 },
    ]);
    expect(r.vencedor_cnpj).toBe('22.222.222/0001-22');
    expect(r.multiplos).toBe(true);
    expect(r.n_fornecedores).toBe(2);
  });

  it('desempata por número de itens quando não há valores', () => {
    const r = derivarVencedorDeProdutos([
      { fornecedor_nome: 'ALFA', fornecedor_cnpj: '11.111.111/0001-11' },
      { fornecedor_nome: 'ALFA', fornecedor_cnpj: '11.111.111/0001-11' },
      { fornecedor_nome: 'BETA', fornecedor_cnpj: '22.222.222/0001-22' },
    ]);
    expect(r.vencedor_cnpj).toBe('11.111.111/0001-11');
  });

  it('considera valor_lote_final e valor_global_final além de valor_total_final', () => {
    const r = derivarVencedorDeProdutos([
      { fornecedor_nome: 'ALFA', fornecedor_cnpj: '11.111.111/0001-11', valor_lote_final: 500 },
      { fornecedor_nome: 'BETA', fornecedor_cnpj: '22.222.222/0001-22', valor_total_final: 100 },
    ]);
    expect(r.vencedor_cnpj).toBe('11.111.111/0001-11');
  });

  it('inclui um trecho explicando a derivação', () => {
    const r = derivarVencedorDeProdutos([
      { fornecedor_nome: 'ALFA', fornecedor_cnpj: '11.111.111/0001-11', valor_total_final: 100 },
      { fornecedor_nome: 'BETA', fornecedor_cnpj: '22.222.222/0001-22', valor_total_final: 50 },
    ]);
    expect(r.trecho).toMatch(/derivado/i);
    expect(r.trecho).toMatch(/2 fornecedores/i);
  });

  it('agrupa por CNPJ normalizado (ignora pontuação)', () => {
    const r = derivarVencedorDeProdutos([
      { fornecedor_nome: 'ALFA', fornecedor_cnpj: '11.111.111/0001-11', valor_total_final: 100 },
      { fornecedor_nome: 'ALFA LTDA', fornecedor_cnpj: '11111111000111', valor_total_final: 50 },
    ]);
    expect(r.n_fornecedores).toBe(1);
    expect(r.multiplos).toBe(false);
  });
});
