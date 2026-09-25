'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const mockConn = new DatabaseSync(':memory:');
mockConn.exec(fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8'));
jest.mock('./connection', () => ({ db: mockConn }));

const repo = require('./pipeline-saude-repo');

let seq = 0;
function seedDoc({ data = '2026-09-20', texto = 'texto do edital' } = {}) {
  seq += 1;
  mockConn
    .prepare(
      `INSERT INTO documentos (id, fonte, tipo, titulo, url_origem, data_publicacao, texto_completo)
       VALUES (?, 'site_prefeitura', 'edital', ?, 'https://x/y', ?, ?)`
    )
    .run(seq, `Doc ${seq}`, data, texto);
  return seq;
}

function seedResumo(docId, { status = 'ok', em = '2026-09-20 10:00:00', erro = null } = {}) {
  mockConn
    .prepare(
      `INSERT INTO documentos_resumos_ai
         (documento_id, provider, modelo, contrato_versao, resumo_json, texto_hash, status, erro, atualizado_em)
       VALUES (?, 'nvidia', 'm', '1.1', '{}', ?, ?, ?, ?)`
    )
    .run(docId, `h${docId}-${status}-${em}`, status, erro, em);
}

describe('pipeline-saude-repo', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM documentos_resumos_ai_jobs; DELETE FROM documentos_resumos_ai; DELETE FROM documentos;');
  });

  it('getUltimoResumoOk retorna o mais recente com status ok', () => {
    const a = seedDoc();
    const b = seedDoc();
    seedResumo(a, { em: '2026-08-27 09:00:00' });
    seedResumo(b, { status: 'erro', em: '2026-09-20 09:00:00', erro: '410 end of life' });

    expect(repo.getUltimoResumoOk()).toMatchObject({ em: '2026-08-27 09:00:00', provider: 'nvidia', modelo: 'm' });
  });

  it('getUltimoResumoOk é null sem resumos', () => {
    expect(repo.getUltimoResumoOk()).toBeNull();
  });

  it('getUltimoErroResumo traz o erro mais recente entre resumos e jobs', () => {
    const a = seedDoc();
    seedResumo(a, { status: 'erro', em: '2026-09-10 09:00:00', erro: 'antigo' });
    mockConn
      .prepare(
        `INSERT INTO documentos_resumos_ai_jobs
           (documento_id, provider, modelo, contrato_versao, texto_hash, status, erro, atualizado_em)
         VALUES (?, 'nvidia', 'm', '1.1', 'h', 'erro', '410 Gone: end of life', '2026-09-24 08:00:00')`
      )
      .run(a);

    expect(repo.getUltimoErroResumo()).toEqual({ em: '2026-09-24 08:00:00', erro: '410 Gone: end of life' });
  });

  it('contarRecentesSemResumo conta docs com texto desde a data, sem resumo ok', () => {
    const comOk = seedDoc({ data: '2026-09-18' });
    seedResumo(comOk);
    const comErro = seedDoc({ data: '2026-09-15' });
    seedResumo(comErro, { status: 'erro', erro: 'x' });
    seedDoc({ data: '2026-09-01' }); // pendente, mais antigo
    seedDoc({ data: '2026-09-10', texto: '' }); // sem texto: fora do universo
    seedDoc({ data: '2026-07-01' }); // fora da janela

    const r = repo.contarRecentesSemResumo({ desde: '2026-08-26' });

    expect(r).toEqual({ total: 3, semResumo: 2, semTexto: 1, maisAntigoSemResumo: '2026-09-01' });
  });
});
