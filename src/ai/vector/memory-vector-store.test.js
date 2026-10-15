'use strict';

const { runVectorStoreContract } = require('../ports/contracts/vector-store.contract');
const { criarMemoryVectorStore } = require('./memory-vector-store');
const { normalizar } = require('./quantizacao');

runVectorStoreContract('memória', ({ dims, quantizacao }) => criarMemoryVectorStore({ dims, quantizacao }), {
  quantizacoes: ['float32', 'int8'],
});

function aleatorio(dims, semente) {
  let s = semente;
  return Array.from({ length: dims }, () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  });
}

describe('memory-vector-store: int8 vs float32', () => {
  const DIMS = 256;
  const N = 300;
  const chunks = Array.from({ length: N }, (_, i) => ({
    id: `c${i}`,
    docId: i,
    texto: `t${i}`,
    metadados: {},
    vetor: aleatorio(DIMS, 100 + i),
  }));

  async function criarCom(quantizacao) {
    const s = criarMemoryVectorStore({ dims: DIMS, quantizacao });
    await s.upsert(chunks);
    return s;
  }

  it('recall@1 do int8 contra o float32 é de pelo menos 95% (consultas perturbadas)', async () => {
    const exato = await criarCom('float32');
    const quant = await criarCom('int8');
    let acertos = 0;
    const consultas = 100;

    for (let i = 0; i < consultas; i += 1) {
      const alvo = chunks[(i * 3) % N].vetor;
      const ruido = aleatorio(DIMS, 5000 + i);
      const consulta = Array.from(normalizar(Float32Array.from(alvo, (x, j) => x + ruido[j] * 0.3)));
      const [a] = await exato.search({ vetor: consulta, k: 1 });
      const [b] = await quant.search({ vetor: consulta, k: 1 });
      if (a.id === b.id) {acertos += 1;}
    }

    expect(acertos / consultas).toBeGreaterThanOrEqual(0.95);
  });

  it('recall@10 do int8 cobre pelo menos 90% dos vizinhos exatos', async () => {
    const exato = await criarCom('float32');
    const quant = await criarCom('int8');
    const consulta = aleatorio(DIMS, 777);

    const topExato = (await exato.search({ vetor: consulta, k: 10 })).map((r) => r.id);
    const topInt8 = (await quant.search({ vetor: consulta, k: 10 })).map((r) => r.id);

    const comuns = topInt8.filter((id) => topExato.includes(id)).length;
    expect(comuns / 10).toBeGreaterThanOrEqual(0.9);
  });

  it('int8 ocupa no máximo 30% do espaço do float32 (vetores)', async () => {
    const exato = await criarCom('float32');
    const quant = await criarCom('int8');

    const razao = (await quant.tamanhoBytes()) / (await exato.tamanhoBytes());

    expect(razao).toBeLessThanOrEqual(0.3);
  });

  it('rejeita quantização desconhecida', () => {
    expect(() => criarMemoryVectorStore({ dims: 8, quantizacao: 'bit' })).toThrow(/quantiza/i);
  });
});
