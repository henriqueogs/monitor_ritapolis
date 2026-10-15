'use strict';

/**
 * Contrato da porta VectorStore (ADR 0002). Qualquer implementação — em memória,
 * sqlite-vec, pgvector — roda esta suíte. Usa as globais do Jest: chame de dentro
 * de um arquivo *.test.js.
 *
 * Chunk:  { id, docId, texto, metadados, vetor }   Resultado: { id, docId, texto, metadados, score }
 */

const { DimensaoInesperadaError } = require('../errors');

const DIMS = 8;
const TOP_SCORE_MINIMO = 0.98; // int8 aproxima; a ordem é o que importa

const base = (i) => Array.from({ length: DIMS }, (_, j) => (j === i ? 1 : 0));
const mistura = (i, j) => base(i).map((x, idx) => x + base(j)[idx]);

function chunk(id, docId, vetor, metadados = {}) {
  return { id, docId, texto: `texto ${id}`, metadados, vetor };
}

function runVectorStoreContract(nome, criar, { quantizacoes = ['float32'] } = {}) {
  describe.each(quantizacoes)(`contrato VectorStore: ${nome} [%s]`, (quantizacao) => {
    let store;
    beforeEach(() => {
      store = criar({ dims: DIMS, quantizacao });
    });

    it('store vazio: busca devolve lista vazia e count é 0', async () => {
      expect(await store.search({ vetor: base(0), k: 5 })).toEqual([]);
      expect(await store.count()).toBe(0);
    });

    it('devolve os vizinhos do mais para o menos similar, com score decrescente', async () => {
      await store.upsert([chunk('A', 1, base(0)), chunk('B', 1, base(1)), chunk('C', 2, mistura(0, 1))]);

      const r = await store.search({ vetor: base(0), k: 3 });

      expect(r.map((x) => x.id)).toEqual(['A', 'C', 'B']);
      expect(r[0].score).toBeGreaterThan(TOP_SCORE_MINIMO);
      expect(r[0].score).toBeGreaterThan(r[1].score);
      expect(r[1].score).toBeGreaterThan(r[2].score);
    });

    it('o resultado traz id, docId, texto e metadados do chunk', async () => {
      await store.upsert([chunk('A', 7, base(0), { ano: 2025, tipo: 'edital' })]);

      const [r] = await store.search({ vetor: base(0), k: 1 });

      expect(r).toMatchObject({ id: 'A', docId: 7, texto: 'texto A', metadados: { ano: 2025, tipo: 'edital' } });
    });

    it('k limita a quantidade de resultados', async () => {
      await store.upsert([chunk('A', 1, base(0)), chunk('B', 1, base(1)), chunk('C', 1, base(2))]);

      expect(await store.search({ vetor: base(0), k: 2 })).toHaveLength(2);
    });

    it('filtros por metadados: valor escalar e lista (IN)', async () => {
      await store.upsert([
        chunk('A', 1, base(0), { ano: 2024 }),
        chunk('B', 2, base(0), { ano: 2025 }),
        chunk('C', 3, base(0), { ano: 2026 }),
      ]);

      const so2025 = await store.search({ vetor: base(0), k: 10, filtros: { ano: 2025 } });
      const doisAnos = await store.search({ vetor: base(0), k: 10, filtros: { ano: [2024, 2026] } });
      const nenhum = await store.search({ vetor: base(0), k: 10, filtros: { ano: 1999 } });

      expect(so2025.map((x) => x.id)).toEqual(['B']);
      expect(doisAnos.map((x) => x.id).sort()).toEqual(['A', 'C']);
      expect(nenhum).toEqual([]);
    });

    it('upsert é idempotente por id: substitui em vez de duplicar', async () => {
      await store.upsert([chunk('A', 1, base(0))]);
      await store.upsert([chunk('A', 1, base(3))]);

      expect(await store.count()).toBe(1);
      const [r] = await store.search({ vetor: base(3), k: 1 });
      expect(r.id).toBe('A');
      expect(r.score).toBeGreaterThan(TOP_SCORE_MINIMO);
    });

    it('deleteByDoc remove só os chunks do documento e informa quantos', async () => {
      await store.upsert([chunk('A', 1, base(0)), chunk('B', 1, base(1)), chunk('C', 2, base(2))]);

      const removidos = await store.deleteByDoc(1);

      expect(removidos).toBe(2);
      expect(await store.count()).toBe(1);
      expect((await store.search({ vetor: base(2), k: 5 })).map((x) => x.id)).toEqual(['C']);
    });

    it('deleteByDoc de documento inexistente devolve 0', async () => {
      expect(await store.deleteByDoc(999)).toBe(0);
    });

    it('rejeita vetor com dimensão errada no upsert e na busca', async () => {
      await expect(store.upsert([chunk('A', 1, [1, 0, 0])])).rejects.toBeInstanceOf(DimensaoInesperadaError);
      await expect(store.search({ vetor: [1, 0, 0], k: 1 })).rejects.toBeInstanceOf(DimensaoInesperadaError);
    });

    it('aceita Float32Array além de array comum', async () => {
      await store.upsert([chunk('A', 1, Float32Array.from(base(0)))]);

      const [r] = await store.search({ vetor: Float32Array.from(base(0)), k: 1 });

      expect(r.id).toBe('A');
    });

    it('informa um tamanho em bytes positivo depois de indexar', async () => {
      await store.upsert([chunk('A', 1, base(0))]);

      expect(await store.tamanhoBytes()).toBeGreaterThan(0);
    });
  });
}

module.exports = { runVectorStoreContract };
