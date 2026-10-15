'use strict';

/**
 * VectorStore sobre SQLite + sqlite-vec (ADR 0002): KNN exato (vec0), cosseno, float32 ou int8.
 * Filtros por metadados são PRÉ-filtro (`rowid IN (...)`), então o top-k sai sempre do conjunto
 * que casa — não há sobrebusca que perca resultado. Persistência e reabertura pelo arquivo.
 * O banco vetorial é separado do banco de documentos (índice derivável, recriável a qualquer hora).
 */

const { DatabaseSync } = require('node:sqlite');
const sqliteVec = require('sqlite-vec');
const { QUANTIZACOES } = require('./memory-vector-store');
const { normalizar, quantizarInt8 } = require('./quantizacao');
const { validarK, validarVetor, vetorNulo, validarChunk } = require('./validacao');

const BYTES_FLOAT32 = 4;
const CHAVE_SEGURA = /^[\w-]+$/;

function abrirBancoVetorial(caminho) {
  const db = new DatabaseSync(caminho, { allowExtension: true });
  db.loadExtension(sqliteVec.getLoadablePath());
  return db;
}

const comoBytes = tipado => new Uint8Array(tipado.buffer, tipado.byteOffset, tipado.byteLength);

function prepararSchema(db, { dims, quantizacao }) {
  const tipo = quantizacao === QUANTIZACOES.INT8 ? 'int8' : 'float';
  db.exec(`
    CREATE TABLE IF NOT EXISTS ia_store_meta (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ia_chunks (
      rowid INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      doc_id,
      texto TEXT NOT NULL,
      metadados TEXT NOT NULL,
      url_origem TEXT NOT NULL,
      origem_generica INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_ia_chunks_doc_id ON ia_chunks (doc_id);
    CREATE VIRTUAL TABLE IF NOT EXISTS ia_vec USING vec0(embedding ${tipo}[${dims}] distance_metric=cosine);
  `);
  const meta = new Map(
    db
      .prepare('SELECT chave, valor FROM ia_store_meta')
      .all()
      .map(r => [r.chave, r.valor])
  );
  const gravado = { dims: meta.get('dims'), quantizacao: meta.get('quantizacao') };
  if (gravado.dims !== undefined && Number(gravado.dims) !== dims) {
    throw new Error(`dimensão do índice (${gravado.dims}) difere da pedida (${dims}): reindexar`);
  }
  if (gravado.quantizacao !== undefined && gravado.quantizacao !== quantizacao) {
    throw new Error(`quantização do índice (${gravado.quantizacao}) difere da pedida: reindexar`);
  }
  const grava = db.prepare('INSERT OR IGNORE INTO ia_store_meta (chave, valor) VALUES (?, ?)');
  grava.run('dims', String(dims));
  grava.run('quantizacao', quantizacao);
}

function condicaoFiltros(filtros) {
  const partes = [];
  const params = [];
  for (const [chave, esperado] of Object.entries(filtros ?? {})) {
    if (!CHAVE_SEGURA.test(chave)) {
      throw new TypeError(`chave de filtro inválida: ${chave}`);
    }
    const valores = (Array.isArray(esperado) ? esperado : [esperado]).map(v =>
      typeof v === 'boolean' ? Number(v) : v
    );
    if (!valores.length) {
      partes.push('0');
      continue;
    }
    partes.push(`json_extract(metadados, '$.${chave}') IN (${valores.map(() => '?').join(',')})`);
    params.push(...valores);
  }
  return { sql: partes.join(' AND '), params };
}

function criarSqliteVecStore({ db, dims, quantizacao = QUANTIZACOES.FLOAT32 }) {
  if (!Object.values(QUANTIZACOES).includes(quantizacao)) {
    throw new Error(
      `Quantização desconhecida: ${quantizacao} (use ${Object.values(QUANTIZACOES).join(' ou ')})`
    );
  }
  prepararSchema(db, { dims, quantizacao });
  const int8 = quantizacao === QUANTIZACOES.INT8;
  const marcador = int8 ? 'vec_int8(?)' : '?';

  const bytesDoVetor = vetor => {
    const unitario = normalizar(vetor);
    return int8 ? comoBytes(quantizarInt8(unitario).dados) : comoBytes(unitario);
  };

  const apagarPorRowids = rowids => {
    const delVec = db.prepare('DELETE FROM ia_vec WHERE rowid = ?');
    const delChunk = db.prepare('DELETE FROM ia_chunks WHERE rowid = ?');
    rowids.forEach(r => {
      delVec.run(BigInt(r));
      delChunk.run(r);
    });
  };

  const emTransacao = fn => {
    db.exec('BEGIN');
    try {
      const retorno = fn();
      db.exec('COMMIT');
      return retorno;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };

  function gravarChunk(c) {
    const existente = db.prepare('SELECT rowid FROM ia_chunks WHERE id = ?').get(c.id);
    if (existente) {
      apagarPorRowids([existente.rowid]);
    }
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO ia_chunks (id, doc_id, texto, metadados, url_origem, origem_generica)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        c.id,
        c.docId,
        c.texto,
        JSON.stringify(c.metadados ?? {}),
        c.url_origem,
        Number(Boolean(c.origemGenerica))
      );
    db.prepare(`INSERT INTO ia_vec (rowid, embedding) VALUES (?, ${marcador})`).run(
      BigInt(lastInsertRowid),
      bytesDoVetor(c.vetor)
    );
  }

  async function upsert(chunks) {
    chunks.forEach(c => validarChunk(c, dims)); // lote inteiro validado antes de gravar
    emTransacao(() => chunks.forEach(gravarChunk));
  }

  async function search({ vetor, k, filtros }) {
    const limite = validarK(k);
    validarVetor(vetor, dims);
    const { sql, params } = condicaoFiltros(filtros);
    if (vetorNulo(vetor)) {
      return [];
    }
    const preFiltro = sql ? `AND rowid IN (SELECT rowid FROM ia_chunks WHERE ${sql})` : '';
    const linhas = db
      .prepare(
        `SELECT c.id, c.doc_id, c.texto, c.metadados, c.url_origem, c.origem_generica, v.distance
           FROM (SELECT rowid, distance FROM ia_vec
                  WHERE embedding MATCH ${marcador} AND k = ? ${preFiltro}) v
           JOIN ia_chunks c ON c.rowid = v.rowid
          ORDER BY v.distance, c.id`
      )
      .all(bytesDoVetor(vetor), limite, ...params);
    return linhas.map(l => ({
      id: l.id,
      docId: l.doc_id,
      texto: l.texto,
      metadados: JSON.parse(l.metadados),
      url_origem: l.url_origem,
      origemGenerica: Boolean(l.origem_generica),
      score: Math.min(1, 1 - l.distance),
    }));
  }

  async function deleteByDoc(docId) {
    const rowids = db
      .prepare('SELECT rowid FROM ia_chunks WHERE doc_id = ?')
      .all(docId)
      .map(r => r.rowid);
    emTransacao(() => apagarPorRowids(rowids));
    return rowids.length;
  }

  const count = async () => db.prepare('SELECT COUNT(*) AS n FROM ia_chunks').get().n;

  async function tamanhoBytes() {
    return (await count()) * (int8 ? dims : dims * BYTES_FLOAT32);
  }

  return { upsert, search, deleteByDoc, count, tamanhoBytes };
}

module.exports = { criarSqliteVecStore, abrirBancoVetorial };
