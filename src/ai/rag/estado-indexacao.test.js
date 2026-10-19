'use strict';

const { DatabaseSync } = require('node:sqlite');
const { criarEstadoIndexacaoSqlite } = require('./estado-indexacao');

describe('estado de indexação em SQLite', () => {
  it('guarda, atualiza, lista e remove hashes; sobrevive a reabrir a tabela', async () => {
    const db = new DatabaseSync(':memory:');
    const estado = criarEstadoIndexacaoSqlite(db);

    await estado.gravar(1, 'h1');
    await estado.gravar(1, 'h1b');
    await estado.gravar(2, 'h2');
    const reaberto = criarEstadoIndexacaoSqlite(db);

    expect(await reaberto.obter(1)).toBe('h1b');
    expect(await reaberto.obter(9)).toBeNull();
    expect((await reaberto.listarDocIds()).sort()).toEqual([1, 2]);
    await reaberto.remover(1);
    expect(await reaberto.obter(1)).toBeNull();
  });
});

describe('estado de indexação somente leitura (dry-run)', () => {
  it('sem a tabela não cria nada e se comporta como vazio', async () => {
    const db = new DatabaseSync(':memory:');

    const estado = criarEstadoIndexacaoSqlite(db, { somenteLeitura: true });

    expect(await estado.obter(1)).toBeNull();
    expect(
      db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'ia_indexacao'").get()
    ).toBeUndefined();
  });

  it('com a tabela lê os hashes existentes e recusa escrita', async () => {
    const db = new DatabaseSync(':memory:');
    await criarEstadoIndexacaoSqlite(db).gravar('documento:1', 'h1');

    const estado = criarEstadoIndexacaoSqlite(db, { somenteLeitura: true });

    expect(await estado.obter('documento:1')).toBe('h1');
    expect(await estado.listarDocIds()).toEqual(['documento:1']);
    await expect(estado.gravar('documento:2', 'h2')).rejects.toThrow(/somente leitura/);
    await expect(estado.remover('documento:1')).rejects.toThrow(/somente leitura/);
  });
});
