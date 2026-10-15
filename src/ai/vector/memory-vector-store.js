'use strict';

/**
 * VectorStore em memória (busca exata). Serve de fake nos testes de contrato, de
 * implementação de referência para a porta e de índice do eval harness.
 * quantizacao: 'float32' (padrão) ou 'int8' (1 byte/dimensão).
 */

const { DimensaoInesperadaError } = require('../ports/errors');
const { normalizar, quantizarInt8, cosseno, cossenoInt8 } = require('./quantizacao');

const QUANTIZACOES = ['float32', 'int8'];
const BYTES_FLOAT32 = 4;
const BYTES_SOBRECARGA_INT8 = 8; // escala + norma (float32 cada)
const MODELO_STORE = 'vector-store';

function casaFiltros(metadados = {}, filtros = {}) {
  return Object.entries(filtros).every(([chave, esperado]) =>
    Array.isArray(esperado) ? esperado.includes(metadados[chave]) : metadados[chave] === esperado
  );
}

function criarMemoryVectorStore({ dims, quantizacao = 'float32' }) {
  if (!QUANTIZACOES.includes(quantizacao)) {
    throw new Error(`Quantização desconhecida: ${quantizacao} (use ${QUANTIZACOES.join(' ou ')})`);
  }
  const entradas = new Map();
  const int8 = quantizacao === 'int8';

  function prepararVetor(vetor) {
    if (vetor.length !== dims) {
      throw new DimensaoInesperadaError({ modelo: MODELO_STORE, esperada: dims, recebida: vetor.length });
    }
    const unitario = normalizar(vetor);
    return int8 ? quantizarInt8(unitario) : unitario;
  }

  const pontuar = (consulta, armazenado) => (int8 ? cossenoInt8(consulta, armazenado) : cosseno(consulta, armazenado));

  return {
    async upsert(chunks) {
      const prontos = chunks.map((c) => ({ ...c, vetor: prepararVetor(c.vetor) }));
      for (const c of prontos) {entradas.set(c.id, c);}
    },

    async search({ vetor, k = 10, filtros }) {
      const consulta = prepararVetor(vetor);
      return [...entradas.values()]
        .filter((e) => casaFiltros(e.metadados, filtros))
        .map((e) => ({ id: e.id, docId: e.docId, texto: e.texto, metadados: e.metadados, score: pontuar(consulta, e.vetor) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    },

    async deleteByDoc(docId) {
      let removidos = 0;
      for (const [id, e] of entradas) {
        if (e.docId === docId) {
          entradas.delete(id);
          removidos += 1;
        }
      }
      return removidos;
    },

    async count() {
      return entradas.size;
    },

    async tamanhoBytes() {
      const porVetor = int8 ? dims + BYTES_SOBRECARGA_INT8 : dims * BYTES_FLOAT32;
      return entradas.size * porVetor;
    },
  };
}

module.exports = { criarMemoryVectorStore, QUANTIZACOES };
