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
