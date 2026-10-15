'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { runVectorStoreContract } = require('../ports/contracts/vector-store.contract');
const { runLexicalSearchContract } = require('../ports/contracts/lexical-search.contract');
const { criarSqliteVecStore, abrirBancoVetorial } = require('./sqlite-vec-store');

const DIMS = 8;
const base = i => Array.from({ length: DIMS }, (_, j) => (j === i ? 1 : 0));
const chunk = (id, docId, vetor, metadados = {}) => ({
  id,
  docId,
  texto: `texto ${id}`,
  metadados,
  vetor,
  url_origem: `https://fonte.example/${id}`,
});

runVectorStoreContract(
  'sqlite-vec',
  ({ dims, quantizacao }) =>
    criarSqliteVecStore({ db: abrirBancoVetorial(':memory:'), dims, quantizacao }),
  { quantizacoes: ['float32', 'int8'] }
);

describe('SqliteVecStore: específicos do adaptador', () => {
  it('pré-filtro é exato: acha o único chunk que casa mesmo longe de muitos vizinhos mais próximos', async () => {
    const store = criarSqliteVecStore({ db: abrirBancoVetorial(':memory:'), dims: DIMS });
    const muitos = Array.from({ length: 300 }, (_, i) => chunk(`n${i}`, i, base(0), { ano: 2024 }));
    await store.upsert([...muitos, chunk('alvo', 999, base(1), { ano: 2025 })]);

    const r = await store.search({ vetor: base(0), k: 1, filtros: { ano: 2025 } });

    expect(r.map(x => x.id)).toEqual(['alvo']);
  });

  it('persiste em arquivo: reabrir o banco mantém chunks, origem e busca', async () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'vec-store-'));
    const arquivo = path.join(pasta, 'v.db');
    try {
      const db1 = abrirBancoVetorial(arquivo);
      await criarSqliteVecStore({ db: db1, dims: DIMS }).upsert([
        chunk('A', 1, base(2), { ano: 2025 }),
      ]);
      db1.close();

      const db2 = abrirBancoVetorial(arquivo);
      const store = criarSqliteVecStore({ db: db2, dims: DIMS });

      expect(await store.count()).toBe(1);
      expect((await store.search({ vetor: base(2), k: 1 }))[0]).toMatchObject({
        id: 'A',
        url_origem: 'https://fonte.example/A',
      });
      db2.close();
    } finally {
      fs.rmSync(pasta, { recursive: true, force: true });
    }
  });

  it('reabrir com dimensão diferente da gravada falha (não mistura modelos)', async () => {
    const db = abrirBancoVetorial(':memory:');
    criarSqliteVecStore({ db, dims: DIMS });

    expect(() => criarSqliteVecStore({ db, dims: DIMS * 2 })).toThrow(/dimens/i);
  });

  it('tamanho em bytes: int8 ocupa ~4x menos que float32 nos vetores', async () => {
    const f32 = criarSqliteVecStore({
      db: abrirBancoVetorial(':memory:'),
      dims: DIMS,
      quantizacao: 'float32',
    });
    const i8 = criarSqliteVecStore({
      db: abrirBancoVetorial(':memory:'),
      dims: DIMS,
      quantizacao: 'int8',
    });
    const lote = [chunk('A', 1, base(0)), chunk('B', 2, base(1))];
    await f32.upsert(lote);
    await i8.upsert(lote);

    expect(await i8.tamanhoBytes()).toBeLessThan(await f32.tamanhoBytes());
  });

  it('quantização desconhecida falha na criação', () => {
    expect(() =>
      criarSqliteVecStore({ db: abrirBancoVetorial(':memory:'), dims: DIMS, quantizacao: 'bit' })
    ).toThrow(/quantiza/i);
  });
});

runLexicalSearchContract(
  'sqlite-vec',
  ({ dims, quantizacao }) =>
    criarSqliteVecStore({ db: abrirBancoVetorial(':memory:'), dims, quantizacao }),
  { quantizacoes: ['float32', 'int8'] }
);
