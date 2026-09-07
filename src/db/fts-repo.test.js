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
jest.mock('./index', () => ({ db: mockConn }));

const { sanitizeFtsQuery, searchDocumentos } = require('./fts-repo');

function seedDocumento(id, tipo, titulo) {
  mockConn
    .prepare(
      `INSERT INTO documentos (id, fonte, tipo, titulo, url_origem, data_publicacao)
       VALUES (?, 'site_prefeitura', ?, ?, 'https://x/y', '2026-01-01')`
    )
    .run(id, tipo, titulo);
}

describe('sanitizeFtsQuery', () => {
  test('converts plain terms to bounded prefix queries', () => {
    expect(sanitizeFtsQuery('pregao escolar')).toBe('pregao* AND escolar*');
  });

  test('strips raw FTS operators and punctuation from user input', () => {
    expect(sanitizeFtsQuery('"pregao" OR titulo:secret*')).toBe('pregao* AND titulosecret*');
  });

  test('returns null for empty or punctuation-only queries', () => {
    expect(sanitizeFtsQuery(' " * : ')).toBeNull();
  });

  test('limits term count to reduce expensive MATCH queries', () => {
    expect(sanitizeFtsQuery('a b c d e f g h i j')).toBe('a* AND b* AND c* AND d* AND e* AND f* AND g* AND h*');
  });
});

describe('searchDocumentos', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM documentos;');
  });

  it('tipo com virgula filtra por qualquer um da lista (busca escopada por area)', () => {
    seedDocumento(1, 'edital', 'Pregão para merenda escolar');
    seedDocumento(2, 'decreto', 'Decreto sobre merenda escolar');
    seedDocumento(3, 'lei_ordinaria', 'Lei sobre merenda escolar');

    const resultado = searchDocumentos('merenda escolar', { tipo: 'decreto,lei_ordinaria' });
    expect(resultado.dados.map((d) => d.id).sort()).toEqual([2, 3]);
  });

  it('tipo sem virgula continua filtrando por match exato (comportamento antigo)', () => {
    seedDocumento(1, 'edital', 'Pregão para merenda escolar');
    seedDocumento(2, 'decreto', 'Decreto sobre merenda escolar');

    const resultado = searchDocumentos('merenda escolar', { tipo: 'edital' });
    expect(resultado.dados.map((d) => d.id)).toEqual([1]);
  });
});
