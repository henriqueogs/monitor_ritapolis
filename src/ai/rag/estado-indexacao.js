'use strict';

/**
 * Estado da indexação incremental: hash do que foi indexado por documento.
 * Porta: obter(docId) → hash | null · gravar(docId, hash) · remover(docId) · listarDocIds().
 * No SQLite o estado pode morar no mesmo arquivo do índice vetorial. Reindexar do zero = apagar o
 * arquivo do índice (apagar só as tabelas de chunks deixaria hashes dizendo que está tudo indexado).
 */

function criarEstadoIndexacaoMemoria() {
  const hashes = new Map();
  return {
    obter: async docId => hashes.get(docId) ?? null,
    gravar: async (docId, hash) => void hashes.set(docId, hash),
    remover: async docId => void hashes.delete(docId),
    listarDocIds: async () => [...hashes.keys()],
  };
}

function criarEstadoIndexacaoSqlite(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ia_indexacao (
      doc_id PRIMARY KEY,
      hash TEXT NOT NULL,
      indexado_em TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  return {
    obter: async docId =>
      db.prepare('SELECT hash FROM ia_indexacao WHERE doc_id = ?').get(docId)?.hash ?? null,
    gravar: async (docId, hash) =>
      void db
        .prepare(
          `INSERT INTO ia_indexacao (doc_id, hash) VALUES (?, ?)
           ON CONFLICT(doc_id) DO UPDATE SET hash = excluded.hash, indexado_em = datetime('now')`
        )
        .run(docId, hash),
    remover: async docId => void db.prepare('DELETE FROM ia_indexacao WHERE doc_id = ?').run(docId),
    listarDocIds: async () =>
      db
        .prepare('SELECT doc_id FROM ia_indexacao')
        .all()
        .map(r => r.doc_id),
  };
}

module.exports = { criarEstadoIndexacaoMemoria, criarEstadoIndexacaoSqlite };
