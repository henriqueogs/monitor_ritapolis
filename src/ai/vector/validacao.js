'use strict';

/** Validações compartilhadas pelas implementações da porta VectorStore (contrato idêntico). */

const { DimensaoInesperadaError } = require('../ports/errors');

const K_PADRAO = 10;
const MODELO_STORE = 'vector-store';

function validarK(k) {
  if (k === undefined || k === null) {
    return K_PADRAO;
  }
  if (!Number.isInteger(k) || k <= 0) {
    throw new TypeError(`k inválido: ${k} (inteiro positivo)`);
  }
  return k;
}

function validarVetor(vetor, dims) {
  if (vetor.length !== dims) {
    throw new DimensaoInesperadaError({
      modelo: MODELO_STORE,
      esperada: dims,
      recebida: vetor.length,
    });
  }
  if (!Array.from(vetor).every(Number.isFinite)) {
    throw new TypeError('vetor com valor não finito (NaN/Infinity)');
  }
}

function vetorNulo(vetor) {
  return Array.from(vetor).every(x => x === 0);
}

function validarChunk(chunk, dims) {
  if (typeof chunk.url_origem !== 'string' || !chunk.url_origem.trim()) {
    throw new TypeError(`url_origem é obrigatória (§11.3) no chunk ${chunk.id}`);
  }
  validarVetor(chunk.vetor, dims);
  if (vetorNulo(chunk.vetor)) {
    throw new TypeError(`vetor nulo no chunk ${chunk.id}: falha do embedder?`);
  }
}

module.exports = { validarK, validarVetor, vetorNulo, validarChunk };
