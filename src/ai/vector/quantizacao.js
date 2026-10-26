'use strict';

/**
 * Operações vetoriais puras: normalização, cosseno e quantização int8 simétrica
 * (1 byte por dimensão; escala própria por vetor). Reduz o armazenamento em ~4×,
 * requisito para caber na RAM da VM de produção (ver docs/spikes/S1-S2-sqlite-vec.md).
 */

const INT8_MAX = 127;

function normalizar(vetor) {
  const v = Float32Array.from(vetor);
  let soma = 0;
  for (let i = 0; i < v.length; i += 1) {
    soma += v[i] * v[i];
  }
  const norma = Math.sqrt(soma);
  if (norma === 0) {
    return v;
  }
  for (let i = 0; i < v.length; i += 1) {
    v[i] /= norma;
  }
  return v;
}

function normaInt8(dados) {
  let soma = 0;
  for (let i = 0; i < dados.length; i += 1) {
    soma += dados[i] * dados[i];
  }
  return Math.sqrt(soma);
}

/** Quantiza um vetor (idealmente já normalizado) para int8 com escala simétrica. */
function quantizarInt8(vetor) {
  let maxAbs = 0;
  for (let i = 0; i < vetor.length; i += 1) {
    maxAbs = Math.max(maxAbs, Math.abs(vetor[i]));
  }
  const escala = maxAbs > 0 ? maxAbs / INT8_MAX : 1;
  const dados = new Int8Array(vetor.length);
  for (let i = 0; i < vetor.length; i += 1) {
    dados[i] = Math.max(-INT8_MAX, Math.min(INT8_MAX, Math.round(vetor[i] / escala)));
  }
  return { dados, escala, norma: normaInt8(dados) };
}

function desquantizar({ dados, escala }) {
  return Float32Array.from(dados, x => x * escala);
}

function cosseno(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

/** Cosseno entre dois vetores int8: as escalas se cancelam, só os inteiros importam. */
function cossenoInt8(a, b) {
  const normaA = a.norma ?? normaInt8(a.dados);
  const normaB = b.norma ?? normaInt8(b.dados);
  if (normaA === 0 || normaB === 0) {
    return 0;
  }
  let dot = 0;
  for (let i = 0; i < a.dados.length; i += 1) {
    dot += a.dados[i] * b.dados[i];
  }
  return dot / (normaA * normaB);
}

module.exports = { normalizar, quantizarInt8, desquantizar, cosseno, cossenoInt8 };
