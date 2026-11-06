'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const mockConn = new DatabaseSync(':memory:');
mockConn.exec(fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8'));
jest.mock('./connection', () => ({ db: mockConn }));

const repo = require('./analista-repo');

let seq = 0;
function seedEmpenho({ cnpj, nome, valor, tipo = 'EO', ano = 2025 }) {
  seq += 1;
  mockConn
    .prepare(
      `INSERT INTO transparencia_despesas
         (exercicio_orcamento, empenho, tipo, data_empenho, credor_cnpj, credor_nome, valor,
          historico, hash_despesa)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'peças', ?)`
    )
    .run(
      ano,
      `${String(seq).padStart(5, '0')}-000`,
      tipo,
      `${ano}-03-10`,
      cnpj,
      nome,
      valor,
      `h-${seq}`
    );
}

describe('analista-repo', () => {
  beforeEach(() => {
    mockConn.exec(
      'DELETE FROM licitacoes_detalhes; DELETE FROM documentos; DELETE FROM transparencia_despesas;'
    );
    seq = 0;
  });

  it('lista credores PJ por valor, só empenhos originais, ignorando CPF', () => {
    seedEmpenho({ cnpj: '11.111.111/0001-11', nome: 'A LTDA', valor: 100 });
    seedEmpenho({ cnpj: '11111111000111', nome: 'A LTDA', valor: 50 });
    seedEmpenho({ cnpj: '22222222000122', nome: 'B LTDA', valor: 500 });
    seedEmpenho({ cnpj: '22222222000122', nome: 'B LTDA', valor: 999, tipo: 'EE' });
    seedEmpenho({ cnpj: '12345678901', nome: 'FULANO', valor: 9999 });
    const r = repo.listarCredoresPorValor({ limite: 10 });
    expect(r.map(c => c.cnpj)).toEqual(['22222222000122', '11111111000111']);
    expect(r[1]).toMatchObject({ empenhos: 2, total: 150 });
  });

  it('busca credor e empenhos por CNPJ com ou sem pontuação', () => {
    seedEmpenho({ cnpj: '11.111.111/0001-11', nome: 'A LTDA', valor: 100 });
    expect(repo.buscarCredor('11111111000111')).toEqual({ nome: 'A LTDA', cnpj: '11111111000111' });
    expect(repo.buscarCredor('00000000000000')).toBeNull();
    expect(repo.listarEmpenhosDoCredor('11.111.111/0001-11')).toHaveLength(1);
  });

  it('lista processos em que o credor é vencedor', () => {
    mockConn
      .prepare(
        `INSERT INTO documentos (fonte, tipo, titulo, url_origem, hash_conteudo)
         VALUES ('prefeitura', 'licitacao', 'Processo 1/2025', 'https://x/p1', 'hc')`
      )
      .run();
    const { id } = mockConn.prepare('SELECT MAX(id) id FROM documentos').get();
    mockConn
      .prepare(
        'INSERT INTO licitacoes_detalhes (documento_id, vencedor_cnpj, valor_final) VALUES (?, ?, ?)'
      )
      .run(id, '11.111.111/0001-11', 5000);
    const r = repo.listarLicitacoesDoCredor('11111111000111');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ titulo: 'Processo 1/2025', url_origem: 'https://x/p1' });
  });
});
