'use strict';

/**
 * Adaptador NVIDIA da porta EmbeddingProvider. Recebe o cliente (SDK `openai`) por injeção:
 * testável sem rede e sem tocar o NvidiaProvider existente.
 *
 * Fatos medidos no spike S2 (docs/spikes/S1-S2-sqlite-vec.md): lote de até 128 textos aceito;
 * `input_type` (passage/query) e `truncate` aceitos; 410 = modelo aposentado (baai/bge-m3).
 */

const { classificarErroProvider, DimensaoInesperadaError } = require('../ports/errors');
const { validarTipo, TIPOS_EMBEDDING } = require('../ports/embedding-provider');

const LOTE_MAXIMO = 128;

function validarConfig({ client, modelo, dims }) {
  if (!client?.embeddings?.create) {throw new TypeError('NVIDIA embeddings: client (SDK openai) é obrigatório');}
  if (!modelo) {throw new TypeError('NVIDIA embeddings: modelo é obrigatório');}
  if (!Number.isInteger(dims) || dims <= 0) {throw new TypeError('NVIDIA embeddings: dims (inteiro > 0) é obrigatório');}
}

function criarNvidiaEmbeddingProvider({ client, modelo, dims, loteMaximo = LOTE_MAXIMO }) {
  validarConfig({ client, modelo, dims });

  async function embedLote(textos, tipo) {
    let resposta;
    try {
      resposta = await client.embeddings.create({
        model: modelo,
        input: textos,
        encoding_format: 'float',
        input_type: tipo,
        truncate: 'END',
      });
    } catch (err) {
      throw classificarErroProvider(err, { modelo });
    }
    const vetores = [...resposta.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    for (const v of vetores) {
      if (v.length !== dims) {throw new DimensaoInesperadaError({ modelo, esperada: dims, recebida: v.length });}
    }
    return vetores;
  }

  return {
    provider: 'nvidia',
    model: modelo,
    dims,
    async embed(textos, { tipo = TIPOS_EMBEDDING.PASSAGE } = {}) {
      validarTipo(tipo);
      const vetores = [];
      for (let i = 0; i < textos.length; i += loteMaximo) {
        vetores.push(...(await embedLote(textos.slice(i, i + loteMaximo), tipo)));
      }
      return vetores;
    },
  };
}

module.exports = { criarNvidiaEmbeddingProvider, LOTE_MAXIMO };
