'use strict';

/**
 * Contrato da porta VectorStore (ADR 0002 e 0005). Qualquer implementação — em memória,
 * sqlite-vec, pgvector — roda esta suíte. Usa as globais do Jest: chame de dentro
 * de um arquivo *.test.js.
 *
 * Chunk:     { id, docId, texto, metadados, vetor, url_origem, origemGenerica? }
 * Resultado: { id, docId, texto, metadados, url_origem, origemGenerica, score }
 * `url_origem` é obrigatória (§11.3: toda informação tem origem rastreável); `origemGenerica`
 * marca origem de último recurso (listagem oficial) para a UI rotular honestamente.
 */

const { DimensaoInesperadaError } = require('../errors');

const DIMS = 8;
const TOP_SCORE_MINIMO = 0.98; // int8 aproxima; a ordem é o que importa
const K_PADRAO = 10;

const base = i => Array.from({ length: DIMS }, (_, j) => (j === i ? 1 : 0));
const mistura = (i, j) => base(i).map((x, idx) => x + base(j)[idx]);

function chunk(id, docId, vetor, metadados = {}, extra = {}) {
  return {
    id,
    docId,
    texto: `texto ${id}`,
    metadados,
    vetor,
    url_origem: `https://fonte.example/${id}`,
    ...extra,
  };
}

const ids = resultados => resultados.map(r => r.id);

function contratoOrdenacao(obter) {
  it('store vazio: busca devolve lista vazia e count é 0', async () => {
    const store = obter();
    expect(await store.search({ vetor: base(0), k: 5 })).toEqual([]);
    expect(await store.count()).toBe(0);
  });

  it('devolve os vizinhos do mais para o menos similar, com score decrescente', async () => {
    const store = obter();
    await store.upsert([
      chunk('A', 1, base(0)),
      chunk('B', 1, base(1)),
      chunk('C', 2, mistura(0, 1)),
    ]);

    const r = await store.search({ vetor: base(0), k: 3 });

    expect(ids(r)).toEqual(['A', 'C', 'B']);
    expect(r[0].score).toBeGreaterThan(TOP_SCORE_MINIMO);
    expect(r[0].score).toBeGreaterThan(r[1].score);
    expect(r[1].score).toBeGreaterThan(r[2].score);
  });

  it('empate de score é resolvido por id crescente (ordem determinística)', async () => {
    const store = obter();
    await store.upsert([chunk('b', 1, base(0)), chunk('a', 2, base(0)), chunk('c', 3, base(0))]);

    expect(ids(await store.search({ vetor: base(0), k: 3 }))).toEqual(['a', 'b', 'c']);
  });

  it('k limita; k maior que o total devolve tudo; k ausente usa o padrão', async () => {
    const store = obter();
    await store.upsert(Array.from({ length: 12 }, (_, i) => chunk(`c${i}`, i, base(i % DIMS))));

    expect(await store.search({ vetor: base(0), k: 2 })).toHaveLength(2);
    expect(await store.search({ vetor: base(0), k: 100 })).toHaveLength(12);
    expect(await store.search({ vetor: base(0) })).toHaveLength(K_PADRAO);
  });

  it.each([0, -1, 1.5, 'x'])('k inválido (%p) rejeita com TypeError', async k => {
    await expect(obter().search({ vetor: base(0), k })).rejects.toBeInstanceOf(TypeError);
  });
}

function contratoConteudo(obter) {
  it('o resultado traz id, docId, texto, metadados e a origem do chunk', async () => {
    const store = obter();
    await store.upsert([
      chunk('A', 7, base(0), { ano: 2025, tipo: 'edital' }, { origemGenerica: true }),
    ]);

    const [r] = await store.search({ vetor: base(0), k: 1 });

    expect(r).toMatchObject({
      id: 'A',
      docId: 7,
      texto: 'texto A',
      metadados: { ano: 2025, tipo: 'edital' },
      url_origem: 'https://fonte.example/A',
      origemGenerica: true,
    });
  });

  it('origemGenerica é false por padrão', async () => {
    const store = obter();
    await store.upsert([chunk('A', 1, base(0))]);

    expect((await store.search({ vetor: base(0), k: 1 }))[0].origemGenerica).toBe(false);
  });

  it.each([undefined, null, ''])(
    'chunk sem url_origem (%p) é rejeitado: sem fonte não indexa (§11.3)',
    async url => {
      const store = obter();

      await expect(store.upsert([chunk('A', 1, base(0), {}, { url_origem: url })])).rejects.toThrow(
        /url_origem/
      );
      expect(await store.count()).toBe(0);
    }
  );

  it('alterar os metadados devolvidos não altera o índice (isolamento)', async () => {
    const store = obter();
    await store.upsert([chunk('A', 1, base(0), { ano: 2025 })]);

    const [r] = await store.search({ vetor: base(0), k: 1 });
    r.metadados.ano = 1999;

    expect((await store.search({ vetor: base(0), k: 1 }))[0].metadados.ano).toBe(2025);
  });
}

function contratoFiltros(obter) {
  const semear = store =>
    store.upsert([
      chunk('A', 1, base(0), { ano: 2024, tipo: 'edital' }),
      chunk('B', 2, base(0), { ano: 2025, tipo: 'edital' }),
      chunk('C', 3, base(0), { ano: 2025, tipo: 'ata' }),
    ]);

  it('filtros por metadados: valor escalar e lista (IN)', async () => {
    const store = obter();
    await semear(store);

    expect(ids(await store.search({ vetor: base(0), k: 10, filtros: { ano: 2024 } }))).toEqual([
      'A',
    ]);
    expect(
      ids(await store.search({ vetor: base(0), k: 10, filtros: { ano: [2024, 2025] } }))
    ).toEqual(['A', 'B', 'C']);
    expect(await store.search({ vetor: base(0), k: 10, filtros: { ano: 1999 } })).toEqual([]);
  });

  it('filtros combinados valem em AND', async () => {
    const store = obter();
    await semear(store);

    expect(
      ids(await store.search({ vetor: base(0), k: 10, filtros: { ano: 2025, tipo: 'ata' } }))
    ).toEqual(['C']);
  });

  it('lista vazia não casa nada; chave inexistente não casa nada; filtros null/{} não filtram', async () => {
    const store = obter();
    await semear(store);

    expect(await store.search({ vetor: base(0), k: 10, filtros: { ano: [] } })).toEqual([]);
    expect(await store.search({ vetor: base(0), k: 10, filtros: { inexistente: 1 } })).toEqual([]);
    expect(await store.search({ vetor: base(0), k: 10, filtros: null })).toHaveLength(3);
    expect(await store.search({ vetor: base(0), k: 10, filtros: {} })).toHaveLength(3);
  });
}

function contratoEscrita(obter) {
  it('upsert é idempotente por id: substitui em vez de duplicar', async () => {
    const store = obter();
    await store.upsert([chunk('A', 1, base(0))]);
    await store.upsert([chunk('A', 1, base(3))]);

    expect(await store.count()).toBe(1);
    const [r] = await store.search({ vetor: base(3), k: 1 });
    expect(r.id).toBe('A');
    expect(r.score).toBeGreaterThan(TOP_SCORE_MINIMO);
  });

  it('id repetido no mesmo lote: o último vence', async () => {
    const store = obter();
    await store.upsert([chunk('A', 1, base(0)), chunk('A', 1, base(5))]);

    expect(await store.count()).toBe(1);
    expect((await store.search({ vetor: base(5), k: 1 }))[0].score).toBeGreaterThan(
      TOP_SCORE_MINIMO
    );
  });

  it('deleteByDoc remove só os chunks do documento, informa quantos e some da busca', async () => {
    const store = obter();
    await store.upsert([chunk('A', 1, base(0)), chunk('B', 1, base(1)), chunk('C', 2, base(2))]);

    const removidos = await store.deleteByDoc(1);

    expect(removidos).toBe(2);
    expect(await store.count()).toBe(1);
    expect(ids(await store.search({ vetor: base(0), k: 5 }))).toEqual(['C']);
  });

  it('deleteByDoc de documento inexistente devolve 0; reindexar o mesmo id depois funciona', async () => {
    const store = obter();
    await store.upsert([chunk('A', 1, base(0))]);

    expect(await store.deleteByDoc(999)).toBe(0);
    await store.deleteByDoc(1);
    await store.upsert([chunk('A', 1, base(0))]);
    expect(await store.count()).toBe(1);
  });

  it('replaceByDoc troca todos os chunks do documento e não toca nos outros', async () => {
    const store = obter();
    await store.upsert([chunk('A', 1, base(0)), chunk('B', 1, base(1)), chunk('C', 2, base(2))]);

    await store.replaceByDoc(1, [chunk('D', 1, base(3))]);

    expect(await store.count()).toBe(2);
    const todos = ids(await store.search({ vetor: base(3), k: 5 })).sort();
    expect(todos).toEqual(['C', 'D']);
  });

  it('replaceByDoc com chunk inválido mantém o índice anterior do documento (atomicidade)', async () => {
    const store = obter();
    await store.upsert([chunk('A', 1, base(0))]);

    await expect(
      store.replaceByDoc(1, [chunk('B', 1, base(1)), chunk('C', 1, [1, 0, 0])])
    ).rejects.toThrow();

    expect(ids(await store.search({ vetor: base(0), k: 5 }))).toEqual(['A']);
  });

  it('docId é comparado como texto: deleteByDoc("1") remove o documento 1', async () => {
    const store = obter();
    await store.upsert([chunk('A', 1, base(0))]);

    expect(await store.deleteByDoc('1')).toBe(1);
  });

  it('upsert em lote com um chunk inválido não grava nenhum (atomicidade)', async () => {
    const store = obter();

    await expect(
      store.upsert([chunk('A', 1, base(0)), chunk('B', 1, [1, 0, 0])])
    ).rejects.toThrow();

    expect(await store.count()).toBe(0);
  });
}

function contratoVetores(obter) {
  it('rejeita vetor com dimensão errada no upsert e na busca', async () => {
    const store = obter();

    await expect(store.upsert([chunk('A', 1, [1, 0, 0])])).rejects.toBeInstanceOf(
      DimensaoInesperadaError
    );
    await expect(store.search({ vetor: [1, 0, 0], k: 1 })).rejects.toBeInstanceOf(
      DimensaoInesperadaError
    );
  });

  it.each([NaN, Infinity])('rejeita vetor com valor não finito (%p)', async ruim => {
    const store = obter();
    const vetor = base(0).map((x, i) => (i === 3 ? ruim : x));

    await expect(store.upsert([chunk('A', 1, vetor)])).rejects.toBeInstanceOf(TypeError);
    await expect(store.search({ vetor, k: 1 })).rejects.toBeInstanceOf(TypeError);
  });

  it('rejeita indexar vetor nulo (esconderia falha do embedder)', async () => {
    await expect(
      obter().upsert([
        chunk(
          'A',
          1,
          base(0).map(() => 0)
        ),
      ])
    ).rejects.toBeInstanceOf(TypeError);
  });

  it('aceita Float32Array além de array comum, tanto no upsert quanto na busca', async () => {
    const store = obter();
    await store.upsert([
      chunk('A', 1, Float32Array.from(base(0))),
      chunk('B', 2, Float32Array.from(base(1))),
    ]);

    const r = await store.search({ vetor: Float32Array.from(base(0)), k: 2 });

    expect(ids(r)).toEqual(['A', 'B']);
  });

  it('informa um tamanho em bytes positivo depois de indexar', async () => {
    const store = obter();
    await store.upsert([chunk('A', 1, base(0))]);

    expect(await store.tamanhoBytes()).toBeGreaterThan(0);
  });
}

function runVectorStoreContract(nome, criar, { quantizacoes = ['float32'] } = {}) {
  describe.each(quantizacoes)(`contrato VectorStore: ${nome} [%s]`, quantizacao => {
    let store;
    beforeEach(() => {
      store = criar({ dims: DIMS, quantizacao });
    });
    const obter = () => store;

    describe('ordenação e k', () => contratoOrdenacao(obter));
    describe('conteúdo e origem', () => contratoConteudo(obter));
    describe('filtros', () => contratoFiltros(obter));
    describe('escrita', () => contratoEscrita(obter));
    describe('vetores', () => contratoVetores(obter));
  });
}

module.exports = { runVectorStoreContract };
