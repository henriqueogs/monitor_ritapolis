'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { limparTextoUndefined } = require('./limpeza-undefined');

function criarBanco() {
  const conn = new DatabaseSync(':memory:');
  conn.exec(fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8'));
  conn
    .prepare(
      `INSERT INTO documentos (id, fonte, tipo, titulo, ano, url_origem, texto_completo)
       VALUES (1, 'site_prefeitura', 'edital', 'Edital', 2024, 'https://x.example/1', 'texto')`
    )
    .run();
  return conn;
}

function produto(conn, hash, campos) {
  conn
    .prepare(
      `INSERT INTO licitacoes_produtos (documento_id, descricao, unidade, lote_numero, fornecedor_cnpj,
         fornecedor_nome, trecho_fonte, origem_detalhe, hash_item)
       VALUES (1, 'Item', @unidade, @lote, @cnpj, @nome, @trecho, @detalhe, @hash)`
    )
    .run({
      unidade: null,
      lote: null,
      cnpj: null,
      nome: null,
      trecho: null,
      detalhe: null,
      ...campos,
      hash,
    });
}

describe('limparTextoUndefined', () => {
  it('troca a string "undefined" por NULL e preserva valores reais', () => {
    const conn = criarBanco();
    produto(conn, 'a', { unidade: 'undefined', lote: 'undefined', cnpj: 'undefined', nome: 'Forn A' });
    produto(conn, 'b', { unidade: 'UN', lote: '3', cnpj: '12345678000190' });

    const resumo = limparTextoUndefined(conn, { apply: true });

    const a = conn.prepare("SELECT * FROM licitacoes_produtos WHERE hash_item = 'a'").get();
    const b = conn.prepare("SELECT * FROM licitacoes_produtos WHERE hash_item = 'b'").get();
    expect([a.unidade, a.lote_numero, a.fornecedor_cnpj]).toEqual([null, null, null]);
    expect(a.fornecedor_nome).toBe('Forn A');
    expect([b.unidade, b.lote_numero, b.fornecedor_cnpj]).toEqual(['UN', '3', '12345678000190']);
    expect(resumo.licitacoes_produtos).toBe(3);
  });

  it('remove o prefixo "undefined | " de origem_detalhe sem perder o resto', () => {
    const conn = criarBanco();
    produto(conn, 'a', { detalhe: 'undefined | ata:negociacao:x.pdf | ata:negociacao:x.pdf' });
    produto(conn, 'b', { detalhe: 'undefined' });

    limparTextoUndefined(conn, { apply: true });

    const detalhes = conn
      .prepare('SELECT origem_detalhe FROM licitacoes_produtos ORDER BY hash_item')
      .all()
      .map((r) => r.origem_detalhe);
    expect(detalhes).toEqual(['ata:negociacao:x.pdf | ata:negociacao:x.pdf', null]);
  });

  it('dry-run só conta, não altera', () => {
    const conn = criarBanco();
    produto(conn, 'a', { unidade: 'undefined' });

    const resumo = limparTextoUndefined(conn, { apply: false });

    expect(resumo.licitacoes_produtos).toBe(1);
    expect(conn.prepare('SELECT unidade FROM licitacoes_produtos').get().unidade).toBe('undefined');
  });

  it('é idempotente', () => {
    const conn = criarBanco();
    produto(conn, 'a', { unidade: 'undefined' });
    limparTextoUndefined(conn, { apply: true });

    expect(limparTextoUndefined(conn, { apply: true }).licitacoes_produtos).toBe(0);
  });
});
