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

const crypto = require('crypto');
const { listResumoAnalises, listDocumentosPendentesResumoAi } = require('./ai-jobs-repo');

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

describe('listDocumentosPendentesResumoAi', () => {
  const sha256 = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');

  function seedDoc(id, dataPublicacao, texto) {
    mockConn
      .prepare(
        `INSERT INTO documentos (id, fonte, tipo, titulo, url_origem, data_publicacao, texto_completo)
         VALUES (?, 'site_prefeitura', 'portaria', ?, 'https://x/y', ?, ?)`
      )
      .run(id, `Doc ${id}`, dataPublicacao, texto);
  }

  function seedResumo(id, { hash, status = 'ok', versao = '1.1' }) {
    mockConn
      .prepare(
        `INSERT INTO documentos_resumos_ai (documento_id, provider, modelo, contrato_versao, resumo_json, texto_hash, status)
         VALUES (?, 'nvidia', 'm', ?, '{}', ?, ?)`
      )
      .run(id, versao, hash, status);
  }

  beforeEach(() => {
    mockConn.exec('DELETE FROM documentos_resumos_ai; DELETE FROM documentos;');
  });

  it('exclui no SQL quem ja tem resumo ok do texto atual, para o limite nao esconder pendentes antigos', () => {
    // Arrange: o mais recente ja esta resumido; o pendente e mais antigo
    seedDoc(1, '2026-09-01', 'texto novo resumido');
    seedResumo(1, { hash: sha256('texto novo resumido') });
    seedDoc(2, '2020-01-01', 'texto antigo pendente');

    // Act
    const pendentes = listDocumentosPendentesResumoAi({ limite: 1, contratoVersao: '1.1' });

    // Assert
    expect(pendentes.map((d) => d.id)).toEqual([2]);
  });

  it('mantem pendente quem tem resumo de texto antigo, de outra versao ou com erro', () => {
    seedDoc(1, '2026-01-03', 'texto mudou');
    seedResumo(1, { hash: sha256('texto anterior') });
    seedDoc(2, '2026-01-02', 'outra versao');
    seedResumo(2, { hash: sha256('outra versao'), versao: '1.0' });
    seedDoc(3, '2026-01-01', 'deu erro');
    seedResumo(3, { hash: sha256('deu erro'), status: 'erro' });

    const pendentes = listDocumentosPendentesResumoAi({ limite: 10, contratoVersao: '1.1' });

    expect(pendentes.map((d) => d.id)).toEqual([1, 2, 3]);
  });
});
