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

const { listResumoAnalises } = require('./ai-jobs-repo');

function seedDocumentoComResumo(id, tipo) {
  mockConn
    .prepare(
      `INSERT INTO documentos (id, fonte, tipo, titulo, url_origem, data_publicacao)
       VALUES (?, 'site_prefeitura', ?, ?, 'https://x/y', '2026-01-01')`
    )
    .run(id, tipo, `Doc ${id}`);
  mockConn
    .prepare(
      `INSERT INTO documentos_resumos_ai (documento_id, provider, modelo, contrato_versao, resumo_json, texto_hash, status)
       VALUES (?, 'nvidia', 'modelo-x', '3.0', '{"resumo_cidadao":"ok"}', 'hash-${id}', 'ok')`
    )
    .run(id);
}

describe('listResumoAnalises', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM documentos_resumos_ai; DELETE FROM documentos;');
  });

  it('sem tipo, retorna resumos de qualquer tipo', () => {
    seedDocumentoComResumo(1, 'edital');
    seedDocumentoComResumo(2, 'decreto');

    const resultado = listResumoAnalises({ limite: 10 });
    expect(resultado.itens.map((i) => i.documento_id).sort()).toEqual([1, 2]);
  });

  it('tipo com virgula filtra por qualquer um da lista (analise em destaque por area)', () => {
    seedDocumentoComResumo(1, 'edital');
    seedDocumentoComResumo(2, 'decreto');
    seedDocumentoComResumo(3, 'contrato');

    const dinheiro = listResumoAnalises({ tipo: 'edital,contrato', limite: 10 });
    expect(dinheiro.itens.map((i) => i.documento_id).sort()).toEqual([1, 3]);
  });

  it('tipo sem virgula continua filtrando por match exato (comportamento antigo)', () => {
    seedDocumentoComResumo(1, 'edital');
    seedDocumentoComResumo(2, 'decreto');

    const resultado = listResumoAnalises({ tipo: 'decreto', limite: 10 });
    expect(resultado.itens.map((i) => i.documento_id)).toEqual([2]);
  });
});
