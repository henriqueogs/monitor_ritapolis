'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const mockConn = new DatabaseSync(':memory:');
mockConn.exec(fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8'));
jest.mock('./connection', () => ({ db: mockConn }));

const repo = require('./ia-fontes-repo');

const TEXTO = 'Texto de edital com conteúdo suficiente para ser indexado. '.repeat(3);

function doc(id, extra = {}) {
  mockConn
    .prepare(
      `INSERT INTO documentos (id, fonte, tipo, titulo, ano, url_origem, url_pdf, texto_completo)
       VALUES (?, 'site_prefeitura', 'edital', ?, 2025, 'https://x/lista', ?, ?)`
    )
    .run(id, `Doc ${id}`, extra.url_pdf ?? null, 'texto' in extra ? extra.texto : TEXTO);
}

function anexo(id, docId, { texto = TEXTO, status = 'ok' } = {}) {
  mockConn
    .prepare(
      `INSERT INTO documentos_anexos (id, documento_id, nome, tipo, url, texto_completo, status_extracao)
       VALUES (?, ?, ?, 'outro', ?, ?, ?)`
    )
    .run(id, docId, `Anexo ${id}.pdf`, `https://x/anexo-${id}.pdf`, texto, status);
}

beforeEach(() => {
  mockConn.exec('DELETE FROM documentos_anexos; DELETE FROM documentos;');
});

describe('listarDocumentosParaIndexar', () => {
  it('só documentos com texto, em ordem de id, paginados por cursor (afterId)', () => {
    doc(1);
    doc(2, { texto: '' });
    doc(3, { texto: null });
    doc(4);
    doc(5);

    const p1 = repo.listarDocumentosParaIndexar({ afterId: 0, limite: 2 });
    const p2 = repo.listarDocumentosParaIndexar({ afterId: p1[p1.length - 1].id, limite: 2 });

    expect(p1.map(d => d.id)).toEqual([1, 4]);
    expect(p2.map(d => d.id)).toEqual([5]);
  });

  it('traz os campos de origem e filtro, e aceita filtro de ano', () => {
    doc(1, { url_pdf: 'https://x/a.pdf' });

    const [d] = repo.listarDocumentosParaIndexar({ afterId: 0, limite: 10 });

    expect(d).toMatchObject({
      id: 1,
      fonte: 'site_prefeitura',
      tipo: 'edital',
      ano: 2025,
      url_origem: 'https://x/lista',
      url_pdf: 'https://x/a.pdf',
    });
    expect(repo.listarDocumentosParaIndexar({ afterId: 0, limite: 10, ano: 1999 })).toEqual([]);
  });
});

describe('listarAnexosParaIndexar', () => {
  it('só anexos com extração ok e texto, com dados do documento pai (doc_*)', () => {
    doc(1);
    anexo(10, 1);
    anexo(11, 1, { status: 'pendente' });
    anexo(12, 1, { texto: '' });
    anexo(13, 1, { status: 'requer_ocr' });

    const r = repo.listarAnexosParaIndexar({ afterId: 0, limite: 10 });

    expect(r.map(a => a.id)).toEqual([10]);
    expect(r[0]).toMatchObject({
      documento_id: 1,
      doc_ano: 2025,
      doc_tipo: 'edital',
      doc_fonte: 'site_prefeitura',
      doc_titulo: 'Doc 1',
      url: 'https://x/anexo-10.pdf',
    });
  });

  it('pagina por cursor', () => {
    doc(1);
    anexo(10, 1);
    anexo(11, 1);
    anexo(12, 1);

    const p1 = repo.listarAnexosParaIndexar({ afterId: 0, limite: 2 });
    const p2 = repo.listarAnexosParaIndexar({ afterId: 11, limite: 2 });

    expect(p1.map(a => a.id)).toEqual([10, 11]);
    expect(p2.map(a => a.id)).toEqual([12]);
  });
});
