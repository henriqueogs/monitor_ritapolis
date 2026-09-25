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
const config = require('../config');
const {
  listResumoAnalises,
  listDocumentosPendentesResumoAi,
  listDocumentosParaResumoAi,
} = require('./ai-jobs-repo');

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

const sha256 = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');

describe('listDocumentosPendentesResumoAi', () => {
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

describe('listDocumentosParaResumoAi', () => {
  const diasAtras = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

  function seedDocTexto(id, data, texto) {
    mockConn
      .prepare(
        `INSERT INTO documentos (id, fonte, tipo, titulo, url_origem, data_publicacao, texto_completo)
         VALUES (?, 'site_prefeitura', 'edital', ?, 'https://x/y', ?, ?)`
      )
      .run(id, `Doc ${id}`, data, texto);
  }

  function seedErro(id, texto) {
    mockConn
      .prepare(
        `INSERT INTO documentos_resumos_ai (documento_id, provider, modelo, contrato_versao, resumo_json, texto_hash, status, erro)
         VALUES (?, 'nvidia', 'm', ?, '{}', ?, 'erro', 'falhou')`
      )
      .run(id, config.aiContractVersion, sha256(texto));
  }

  beforeEach(() => {
    mockConn.exec('DELETE FROM documentos_resumos_ai; DELETE FROM documentos;');
  });

  it('entre antigos, prioriza nunca tentados antes dos que ja deram erro (fila nao trava)', () => {
    // Arrange: o mais recente dos antigos ja falhou; um mais antigo nunca foi tentado
    seedDocTexto(1, diasAtras(100), 'texto um');
    seedErro(1, 'texto um');
    seedDocTexto(2, diasAtras(200), 'texto dois');

    // Act
    const fila = listDocumentosParaResumoAi({ limite: 1 });

    // Assert
    expect(fila.map((d) => d.id)).toEqual([2]);
  });

  it('publicado nos ultimos 30 dias vem antes de antigo nunca tentado, mesmo se ja deu erro', () => {
    // Arrange: recente com timeout anterior; antigo nunca tentado
    seedDocTexto(1, diasAtras(5), 'recente com erro');
    seedErro(1, 'recente com erro');
    seedDocTexto(2, diasAtras(400), 'antigo nunca tentado');

    // Act
    const fila = listDocumentosParaResumoAi({ limite: 1 });

    // Assert
    expect(fila.map((d) => d.id)).toEqual([1]);
  });

  it('ordena recentes nunca tentados, recentes com erro, antigos nunca tentados, antigos com erro', () => {
    seedDocTexto(1, diasAtras(2), 'recente erro');
    seedErro(1, 'recente erro');
    seedDocTexto(2, diasAtras(10), 'recente novo');
    seedDocTexto(3, diasAtras(90), 'antigo erro');
    seedErro(3, 'antigo erro');
    seedDocTexto(4, diasAtras(300), 'antigo novo');

    expect(listDocumentosParaResumoAi({ limite: 10 }).map((d) => d.id)).toEqual([2, 1, 4, 3]);
  });
});
