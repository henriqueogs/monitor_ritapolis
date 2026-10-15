'use strict';

/**
 * EmbeddingProvider falso e determinístico (hash de palavras). Sem rede, sem custo:
 * alimenta os testes de contrato e o eval harness no CI. Textos que compartilham
 * palavras ficam próximos — suficiente para validar a MECÂNICA da recuperação,
 * não a qualidade semântica (essa é medida com o modelo real).
 *   falha: 'modelo_morto' → ModeloIndisponivelError · 'limite' → ProviderLimiteError
 */

const { ModeloIndisponivelError, ProviderLimiteError } = require('../ports/errors');
const { validarTipo, TIPOS_EMBEDDING } = require('../ports/embedding-provider');
const { normalizar } = require('../vector/quantizacao');

const DIMS_PADRAO = 256;
const FNV_PRIMO = 16777619;
const FNV_BASE = 2166136261;
const STATUS_GONE = 410;
const RETRY_AFTER_PADRAO_MS = 1000;
const STOPWORDS = new Set(
  'a o as os um uma de da do das dos em no na nos nas para por com que e ou se foi ao aos qual quem quais'.split(' ')
);

function hashFnv(texto) {
  let h = FNV_BASE;
  for (let i = 0; i < texto.length; i += 1) {
    h = Math.imul(h ^ texto.charCodeAt(i), FNV_PRIMO) >>> 0;
  }
  return h;
}

function tokens(texto) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOPWORDS.has(t));
}

function vetorDe(texto, dims) {
  const v = new Float32Array(dims);
  for (const t of tokens(texto)) {v[hashFnv(t) % dims] += 1;}
  return Array.from(normalizar(v));
}

function criarFakeEmbeddingProvider({ dims = DIMS_PADRAO, modelo = 'fake-hash-embed', falha = null } = {}) {
  return {
    provider: 'fake',
    model: modelo,
    dims,
    async embed(textos, { tipo = TIPOS_EMBEDDING.PASSAGE } = {}) {
      validarTipo(tipo);
      if (falha === 'modelo_morto') {throw new ModeloIndisponivelError({ modelo, status: STATUS_GONE });}
      if (falha === 'limite') {throw new ProviderLimiteError({ modelo, retryAfterMs: RETRY_AFTER_PADRAO_MS });}
      return textos.map((t) => vetorDe(t, dims));
    },
  };
}

module.exports = { criarFakeEmbeddingProvider };
