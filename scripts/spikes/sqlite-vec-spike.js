'use strict';

/**
 * Spike S1 (ADR 0002): `sqlite-vec` carrega em `node:sqlite` e atende o volume do acervo?
 * Autocontido: usa banco em memória e vetores aleatórios — não toca o banco real.
 *
 * Pré-requisito (NÃO é dependência do projeto ainda):
 *   npm install --no-save sqlite-vec@0.1.9
 *
 * Uso (rode na máquina alvo, principalmente na VM Linux ARM de produção):
 *   N=66000 node --no-warnings scripts/spikes/sqlite-vec-spike.js
 *
 * Saída: JSON com carregamento da extensão, tempos de inserção/KNN e comparação com a
 * busca exata em JS (fallback da porta VectorStore).
 */

const { DatabaseSync } = require('node:sqlite');

const DIMS = 1024; // baai/bge-m3
const N = Number(process.env.N || 20000);
const K = 10;
const K_FILTRADO = 200;
const ANO_BASE = 2019;
const ANOS = 8;

function vetorAleatorioNormalizado(dims) {
  const v = new Float32Array(dims);
  let soma = 0;
  for (let i = 0; i < dims; i += 1) {
    v[i] = Math.random() * 2 - 1;
    soma += v[i] * v[i];
  }
  const norma = Math.sqrt(soma);
  for (let i = 0; i < dims; i += 1) {v[i] /= norma;}
  return v;
}

const bytes = (v) => new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
const ms = (t0) => Math.round(Number(process.hrtime.bigint() - t0) / 1e6);

function carregarSqliteVec() {
  try {
    return require('sqlite-vec');
  } catch (err) {
    throw new Error(`sqlite-vec não instalado (npm install --no-save sqlite-vec@0.1.9): ${err.message}`, { cause: err });
  }
}

function abrirBanco(sqliteVec, saida) {
  const db = new DatabaseSync(':memory:', { allowExtension: true });
  saida.allowExtension = true;
  db.loadExtension(sqliteVec.getLoadablePath());
  saida.loadExtension = 'ok';
  saida.vec_version = db.prepare('select vec_version() as v').get().v;
  return db;
}

function popular(db, consultaAlvo) {
  db.exec(`
    CREATE TABLE chunks (id INTEGER PRIMARY KEY, doc_id INTEGER, ano INTEGER, tipo TEXT);
    CREATE VIRTUAL TABLE vec_chunks USING vec0(embedding float[${DIMS}]);
  `);
  const insChunk = db.prepare('INSERT INTO chunks (id, doc_id, ano, tipo) VALUES (?, ?, ?, ?)');
  const insVec = db.prepare('INSERT INTO vec_chunks (rowid, embedding) VALUES (?, ?)');
  db.exec('BEGIN');
  for (let i = 1; i <= N; i += 1) {
    const v = i === 1 ? consultaAlvo : vetorAleatorioNormalizado(DIMS);
    insChunk.run(i, Math.ceil(i / K), ANO_BASE + (i % ANOS), i % 3 === 0 ? 'edital' : 'ata');
    insVec.run(BigInt(i), bytes(v));
  }
  db.exec('COMMIT');
}

function buscaExataJs(db, consulta) {
  const pontos = [];
  for (const row of db.prepare('SELECT rowid, embedding FROM vec_chunks').iterate()) {
    const b = row.embedding;
    const v = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
    let dot = 0;
    for (let i = 0; i < DIMS; i += 1) {dot += v[i] * consulta[i];}
    pontos.push({ id: Number(row.rowid), sim: dot });
  }
  pontos.sort((a, b) => b.sim - a.sim);
  return pontos[0].id;
}

function main() {
  const saida = { plataforma: `${process.platform}/${process.arch}`, node: process.version, dims: DIMS, n: N };
  const sqliteVec = carregarSqliteVec();
  const consulta = vetorAleatorioNormalizado(DIMS);
  const db = abrirBanco(sqliteVec, saida);

  let t0 = process.hrtime.bigint();
  popular(db, consulta);
  saida.insert_ms = ms(t0);

  t0 = process.hrtime.bigint();
  const knn = db
    .prepare(`SELECT rowid, distance FROM vec_chunks WHERE embedding MATCH ? AND k = ${K} ORDER BY distance`)
    .all(bytes(consulta));
  saida.knn_ms = ms(t0);
  saida.knn_acertou_o_proprio_vetor = Number(knn[0].rowid) === 1 && knn[0].distance < 1e-3;

  t0 = process.hrtime.bigint();
  const filtrado = db
    .prepare(`
      SELECT c.id FROM (SELECT rowid, distance FROM vec_chunks WHERE embedding MATCH ? AND k = ${K_FILTRADO} ORDER BY distance) v
      JOIN chunks c ON c.id = v.rowid WHERE c.ano = 2025 AND c.tipo = 'edital' ORDER BY v.distance LIMIT ${K}
    `)
    .all(bytes(consulta));
  saida.knn_filtrado_ms = ms(t0);
  saida.knn_filtrado_n = filtrado.length;

  t0 = process.hrtime.bigint();
  saida.fallback_js_top1_concorda = buscaExataJs(db, consulta) === Number(knn[0].rowid);
  saida.fallback_js_ms = ms(t0);
  saida.mb_vetores_float32 = Math.round((N * DIMS * 4) / 1024 / 1024);

  process.stdout.write(`${JSON.stringify(saida, null, 2)}\n`);
}

main();
