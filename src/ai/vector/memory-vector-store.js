'use strict';

/**
 * VectorStore em memória (busca exata). Serve de fake nos testes de contrato, de
 * implementação de referência para a porta e de índice do eval harness.
 * quantizacao: 'float32' (padrão) ou 'int8' (1 byte/dimensão).
 */

const { validarK, validarVetor, vetorNulo, validarChunk } = require('./validacao');
const { normalizar, quantizarInt8, cosseno, cossenoInt8 } = require('./quantizacao');

const QUANTIZACOES = Object.freeze({ FLOAT32: 'float32', INT8: 'int8' });
const BYTES_FLOAT32 = 4;
const BYTES_SOBRECARGA_INT8 = 8; // escala + norma (float32 cada)

function casaFiltros(metadados, filtros) {
  return Object.entries(filtros ?? {}).every(([chave, esperado]) =>
    Array.isArray(esperado) ? esperado.includes(metadados[chave]) : metadados[chave] === esperado
  );
}

const porScoreDepoisId = (a, b) => b.score - a.score || (a.id < b.id ? -1 : 1);

function resultado(entrada, score) {
  const { id, docId, texto, metadados, url_origem: urlOrigem, origemGenerica } = entrada;
  return {
    id,
    docId,
    texto,
    metadados: structuredClone(metadados),
    url_origem: urlOrigem,
    origemGenerica,
    score,
  };
}

function criarMemoryVectorStore({ dims, quantizacao = QUANTIZACOES.FLOAT32 }) {
  if (!Object.values(QUANTIZACOES).includes(quantizacao)) {
    throw new Error(
      `Quantização desconhecida: ${quantizacao} (use ${Object.values(QUANTIZACOES).join(' ou ')})`
    );
  }
  const entradas = new Map();
  const int8 = quantizacao === QUANTIZACOES.INT8;

  const preparar = vetor => {
    const unitario = normalizar(vetor);
    return int8 ? quantizarInt8(unitario) : unitario;
  };
  const pontuar = (consulta, armazenado) =>
    int8 ? cossenoInt8(consulta, armazenado) : cosseno(consulta, armazenado);

  const paraEntrada = c => ({
    id: c.id,
    docId: c.docId,
    texto: c.texto,
    metadados: structuredClone(c.metadados ?? {}),
    url_origem: c.url_origem,
    origemGenerica: Boolean(c.origemGenerica),
    vetor: preparar(c.vetor),
  });

  async function upsert(chunks) {
    chunks.forEach(c => validarChunk(c, dims)); // valida o lote inteiro antes de gravar (atomicidade)
    for (const c of chunks) {
      entradas.set(c.id, paraEntrada(c));
    }
  }

  async function search({ vetor, k, filtros }) {
    const limite = validarK(k);
    validarVetor(vetor, dims);
    if (vetorNulo(vetor)) {
      return [];
    }
    const consulta = preparar(vetor);
    return [...entradas.values()]
      .filter(e => casaFiltros(e.metadados, filtros))
      .map(e => resultado(e, pontuar(consulta, e.vetor)))
      .sort(porScoreDepoisId)
      .slice(0, limite);
  }

  async function deleteByDoc(docId) {
    const alvo = [...entradas.values()].filter(e => e.docId === docId);
    alvo.forEach(e => entradas.delete(e.id));
    return alvo.length;
  }

  async function tamanhoBytes() {
    return entradas.size * (int8 ? dims + BYTES_SOBRECARGA_INT8 : dims * BYTES_FLOAT32);
  }

  return { upsert, search, deleteByDoc, count: async () => entradas.size, tamanhoBytes };
}

module.exports = { criarMemoryVectorStore, QUANTIZACOES };
