'use strict';

/**
 * VectorStore em memória (busca exata). Serve de fake nos testes de contrato, de
 * implementação de referência para a porta e de índice do eval harness.
 * quantizacao: 'float32' (padrão) ou 'int8' (1 byte/dimensão).
 */

const { validarK, validarVetor, vetorNulo, validarChunk } = require('./validacao');
const { tokenizar } = require('./lexical');
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

const BM25_K1 = 1.2;
const BM25_B = 0.75;

/** BM25 sobre os textos (o mesmo princípio do FTS5 do adaptador SQLite). */
function pontuarBm25(consulta, textos) {
  const docs = textos.map(tokenizar);
  const media = docs.reduce((a, d) => a + d.length, 0) / (docs.length || 1) || 1;
  const termos = [...new Set(tokenizar(consulta))];
  const idf = termos.map(t => {
    const df = docs.filter(d => d.includes(t)).length;
    return Math.log(1 + (docs.length - df + 0.5) / (df + 0.5));
  });
  return docs.map(d =>
    termos.reduce((soma, t, j) => {
      const tf = d.filter(x => x === t).length;
      const denom = tf + BM25_K1 * (1 - BM25_B + (BM25_B * d.length) / media);
      return tf ? soma + (idf[j] * tf * (BM25_K1 + 1)) / denom : soma;
    }, 0)
  );
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

  async function searchLexical({ consulta, vetor, k, filtros }) {
    const limite = validarK(k);
    validarVetor(vetor, dims);
    const todas = [...entradas.values()];
    const pontos = pontuarBm25(
      consulta,
      todas.map(e => e.texto)
    );
    const consultaVetor = vetorNulo(vetor) ? null : preparar(vetor);
    return todas
      .map((e, i) => ({ e, lexical: pontos[i] }))
      .filter(({ e, lexical }) => lexical > 0 && casaFiltros(e.metadados, filtros))
      .sort((a, b) => b.lexical - a.lexical || (a.e.id < b.e.id ? -1 : 1))
      .slice(0, limite)
      .map(({ e }) => resultado(e, consultaVetor ? pontuar(consultaVetor, e.vetor) : 0));
  }

  async function deleteByDoc(docId) {
    const alvo = [...entradas.values()].filter(e => e.docId === docId);
    alvo.forEach(e => entradas.delete(e.id));
    return alvo.length;
  }

  async function tamanhoBytes() {
    return entradas.size * (int8 ? dims + BYTES_SOBRECARGA_INT8 : dims * BYTES_FLOAT32);
  }

  return {
    upsert,
    search,
    searchLexical,
    deleteByDoc,
    count: async () => entradas.size,
    tamanhoBytes,
  };
}

module.exports = { criarMemoryVectorStore, QUANTIZACOES };
