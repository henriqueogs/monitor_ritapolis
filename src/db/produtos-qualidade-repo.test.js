'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function criarBancoMemoria() {
  const conn = new DatabaseSync(':memory:');
  conn.exec(fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8'));
  return conn;
}

const mockConn = criarBancoMemoria();
jest.mock('./connection', () => ({ db: mockConn }));

const { marcarItensLixo, FONTE_VALIDACAO } = require('./produtos-qualidade-repo');

let seq = 0;
function seedProduto({ descricao, statusRevisao = 'pendente' } = {}) {
  seq += 1;
  mockConn
    .prepare(
      `INSERT INTO licitacoes_produtos
         (documento_id, ano, item_numero, descricao, descricao_normalizada, origem, hash_item, status_revisao)
       VALUES (1, 2026, ?, ?, ?, 'ata_resultado', ?, ?)`
    )
    .run(String(seq), descricao, String(descricao || '').toLowerCase(), `h-${seq}`, statusRevisao);
  return mockConn.prepare('SELECT last_insert_rowid() AS id').get().id;
}

function getProduto(id) {
  return mockConn.prepare('SELECT * FROM licitacoes_produtos WHERE id = ?').get(id);
}

describe('produtos-qualidade-repo', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM licitacoes_produtos_validacoes; DELETE FROM licitacoes_produtos; DELETE FROM documentos;');
    mockConn.prepare(`INSERT INTO documentos (id, fonte, tipo, titulo, url_origem) VALUES (1, 'x', 'edital', 'D', 'u')`).run();
    seq = 0;
  });

  it('marca lixo (sem letra) e preserva itens reais', () => {
    const lixo = seedProduto({ descricao: '| 128.90' });
    const real = seedProduto({ descricao: 'CD- RW 48 X 700 MB' });
    const abrev = seedProduto({ descricao: 'R22' });

    const r = marcarItensLixo({});

    expect(r.marcados).toBe(1);
    expect(getProduto(lixo).status_revisao).toBe('rejeitado');
    expect(getProduto(real).status_revisao).toBe('pendente');
    expect(getProduto(abrev).status_revisao).toBe('pendente');

    const v = mockConn
      .prepare('SELECT * FROM licitacoes_produtos_validacoes WHERE produto_id = ? AND fonte = ?')
      .all(lixo, FONTE_VALIDACAO);
    expect(v).toHaveLength(1);
    expect(v[0].status).toBe('descartado');
  });

  it('é idempotente (roda 2× sem duplicar)', () => {
    seedProduto({ descricao: '5091' });
    marcarItensLixo({});
    const r2 = marcarItensLixo({});
    expect(r2.marcados).toBe(0);
    expect(r2.ja_marcados).toBe(1);
  });

  it('dry-run não grava', () => {
    const lixo = seedProduto({ descricao: '2637' });
    const r = marcarItensLixo({ dryRun: true });
    expect(r.marcados).toBe(1);
    expect(getProduto(lixo).status_revisao).toBe('pendente');
  });

  it('não rebaixa produto validado por humano', () => {
    const lixo = seedProduto({ descricao: '| 99.00', statusRevisao: 'validado' });
    marcarItensLixo({});
    expect(getProduto(lixo).status_revisao).toBe('validado');
  });
});
