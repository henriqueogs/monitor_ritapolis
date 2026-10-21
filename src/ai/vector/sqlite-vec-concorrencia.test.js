'use strict';

/**
 * O índice vetorial é escrito pelo indexador e lido pela API ao mesmo tempo (mesmo arquivo).
 * Achado em produção (21/10/2026): uma leitura simultânea derrubou a escrita com
 * "database is locked", porque o arquivo estava em modo de diário comum e sem espera por lock.
 * Arquivo em WAL + busy_timeout: leitor e escritor convivem.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { criarSqliteVecStore, abrirBancoVetorial } = require('./sqlite-vec-store');

const DIMS = 8;
const base = i => Array.from({ length: DIMS }, (_, j) => (j === i ? 1 : 0));
const chunk = (id, docId, vetor) => ({
  id,
  docId,
  texto: `texto ${id}`,
  metadados: {},
  vetor,
  url_origem: `https://fonte.example/${id}`,
});

function comArquivo(fn) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'vec-conc-'));
  const arquivo = path.join(pasta, 'v.db');
  const abertos = [];
  const abrir = (...args) => {
    const db = abrirBancoVetorial(...args);
    abertos.push(db);
    return db;
  };
  return Promise.resolve(fn({ arquivo, abrir })).finally(() => {
    abertos.forEach(db => {
      try {
        db.close();
      } catch {
        // já fechado pelo teste
      }
    });
    fs.rmSync(pasta, { recursive: true, force: true });
  });
}

describe('abrirBancoVetorial: concorrência entre leitor e escritor', () => {
  it('arquivo abre em modo WAL e com espera por lock', () =>
    comArquivo(({ arquivo, abrir }) => {
      const db = abrir(arquivo);

      expect(db.prepare('PRAGMA journal_mode').get().journal_mode).toBe('wal');
      expect(db.prepare('PRAGMA busy_timeout').get().timeout).toBeGreaterThan(0);
    }));

  it('escrita confirma mesmo com um leitor com transação de leitura aberta', () =>
    comArquivo(async ({ arquivo, abrir }) => {
      const escritor = abrir(arquivo);
      const store = criarSqliteVecStore({ db: escritor, dims: DIMS });
      await store.upsert([chunk('A', 1, base(0))]);
      const leitor = abrir(arquivo);
      leitor.exec('BEGIN');
      leitor.prepare('SELECT COUNT(*) AS n FROM ia_chunks').get(); // mantém a leitura aberta

      await expect(store.upsert([chunk('B', 2, base(1))])).resolves.toBeUndefined();

      expect(await store.count()).toBe(2);
      leitor.exec('COMMIT');
    }));

  it('leitor somente leitura enxerga o que o escritor já confirmou', () =>
    comArquivo(async ({ arquivo, abrir }) => {
      const escritor = abrir(arquivo);
      const store = criarSqliteVecStore({ db: escritor, dims: DIMS });
      await store.upsert([chunk('A', 1, base(0))]);

      const leitor = abrir(arquivo, { somenteLeitura: true });

      expect(leitor.prepare('SELECT COUNT(*) AS n FROM ia_chunks').get().n).toBe(1);
      await store.upsert([chunk('B', 2, base(1))]);
      expect(leitor.prepare('SELECT COUNT(*) AS n FROM ia_chunks').get().n).toBe(2);
    }));

  it('banco em memória não recebe pragma de arquivo (continua funcionando)', () => {
    const db = abrirBancoVetorial(':memory:');

    expect(() => db.prepare('SELECT 1').get()).not.toThrow();
    db.close();
  });
});
