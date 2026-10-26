'use strict';

/**
 * Adaptador NVIDIA da porta EmbeddingProvider. Recebe o cliente (SDK `openai`) por injeção:
 * testável sem rede e sem tocar o NvidiaProvider existente.
 *
 * Fatos medidos no spike S2 (docs/spikes/S1-S2-sqlite-vec.md): lote de até 128 textos aceito;
 * `input_type` (passage/query) e `truncate` aceitos; 410 = modelo aposentado (baai/bge-m3).
 */

const { classificarErroProvider, DimensaoInesperadaError } = require('../ports/errors');
const { validarTipo, validarTextos, TIPOS_EMBEDDING } = require('../ports/embedding-provider');

const LOTE_MAXIMO = 128;

function validarConfig({ client, modelo, dims, loteMaximo }) {
  if (!Number.isInteger(loteMaximo) || loteMaximo <= 0) {
    throw new TypeError('NVIDIA embeddings: loteMaximo (inteiro > 0) inválido');
  }
  if (!client?.embeddings?.create) {
    throw new TypeError('NVIDIA embeddings: client (SDK openai) é obrigatório');
  }
  if (!modelo) {
    throw new TypeError('NVIDIA embeddings: modelo é obrigatório');
  }
  if (!Number.isInteger(dims) || dims <= 0) {
    throw new TypeError('NVIDIA embeddings: dims (inteiro > 0) é obrigatório');
  }
}

function criarNvidiaEmbeddingProvider({ client, modelo, dims, loteMaximo = LOTE_MAXIMO }) {
  validarConfig({ client, modelo, dims, loteMaximo });

  function extrairVetores(resposta, esperados) {
    const data = resposta?.data;
    if (!Array.isArray(data) || data.length !== esperados) {
      throw new Error(
        `NVIDIA embeddings [${modelo}]: resposta com ${data?.length ?? 0} vetor(es) para ${esperados} texto(s)`
      );
    }
    const porIndice = new Array(esperados);
    for (const item of data) {
      if (
        !Number.isInteger(item.index) ||
        item.index < 0 ||
        item.index >= esperados ||
        porIndice[item.index]
      ) {
        throw new Error(
          `NVIDIA embeddings [${modelo}]: índice inválido ou duplicado na resposta (${item.index})`
        );
      }
      porIndice[item.index] = item.embedding;
    }
    for (const v of porIndice) {
      if (v.length !== dims) {
        throw new DimensaoInesperadaError({ modelo, esperada: dims, recebida: v.length });
      }
    }
    return porIndice;
  }

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
    return extrairVetores(resposta, textos.length);
  }

  return {
    provider: 'nvidia',
    model: modelo,
    dims,
    async embed(textos, { tipo = TIPOS_EMBEDDING.PASSAGE } = {}) {
      validarTipo(tipo);
      validarTextos(textos);
      const vetores = [];
      for (let i = 0; i < textos.length; i += loteMaximo) {
        vetores.push(...(await embedLote(textos.slice(i, i + loteMaximo), tipo)));
      }
      return vetores;
    },
  };
}

module.exports = { criarNvidiaEmbeddingProvider, LOTE_MAXIMO };
