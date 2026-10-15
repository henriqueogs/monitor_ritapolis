'use strict';

/**
 * Porta VectorStore (ADR 0002).
 *   upsert(chunks: { id, docId, texto, metadados, vetor }[]) → Promise<void>      (idempotente por id)
 *   search({ vetor, k, filtros? }) → Promise<{ id, docId, texto, metadados, score }[]>   (score = cosseno, desc)
 *   deleteByDoc(docId) → Promise<number>      count() → Promise<number>      tamanhoBytes() → Promise<number>
 * `filtros` casa metadados por igualdade ou lista (IN). Contrato executável: ./contracts/vector-store.contract.js
 */

const METODOS = ['upsert', 'search', 'deleteByDoc', 'count', 'tamanhoBytes'];

function assertVectorStore(store) {
  if (!store || typeof store !== 'object') {throw new TypeError('VectorStore inválido: objeto esperado');}
  const faltando = METODOS.filter((m) => typeof store[m] !== 'function');
  if (faltando.length) {throw new TypeError(`VectorStore inválido: faltam ${faltando.join(', ')}`);}
  return store;
}

module.exports = { assertVectorStore };
