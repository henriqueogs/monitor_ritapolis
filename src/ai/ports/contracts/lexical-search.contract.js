'use strict';

/**
 * Contrato do ramo lexical de um VectorStore (ADR 0003): `searchLexical({ consulta, vetor, k, filtros })`.
 * Ordena por relevância lexical (BM25 ou equivalente), tolera acento/caixa, aplica os mesmos filtros
 * da busca vetorial e devolve o mesmo formato de resultado, com `score` = cosseno entre `vetor` e o
 * chunk — assim o sinal de evidência é o mesmo nos dois ramos. Usa as globais do Jest.
 */

const DIMS = 8;
const base = i => Array.from({ length: DIMS }, (_, j) => (j === i ? 1 : 0));

function chunk(id, docId, texto, vetor, metadados = {}) {
  return { id, docId, texto, metadados, vetor, url_origem: `https://fonte.example/${id}` };
}

const ids = r => r.map(x => x.id);

function contratoRelevancia(obter) {
  it('acha pelo identificador exato e ordena pelo que mais casa', async () => {
    const store = obter();
    await store.upsert([
      chunk('A', 1, 'Pregão PP-001/2025 para merenda escolar', base(0)),
      chunk('B', 2, 'Pregão PP-002/2025 para merenda escolar e limpeza', base(1)),
      chunk('C', 3, 'Ata de reunião do conselho', base(2)),
    ]);

    const r = await store.searchLexical({ consulta: 'PP-001/2025', vetor: base(0), k: 5 });

    expect(ids(r)[0]).toBe('A');
    expect(ids(r)).not.toContain('C');
  });

  it('ignora acento e caixa', async () => {
    const store = obter();
    await store.upsert([chunk('A', 1, 'Aquisição de AMBULÂNCIA', base(0))]);

    expect(
      ids(await store.searchLexical({ consulta: 'ambulancia', vetor: base(0), k: 5 }))
    ).toEqual(['A']);
  });

  it('sem termo em comum, sem resultado; consulta só de stopwords/vazia dá lista vazia', async () => {
    const store = obter();
    await store.upsert([chunk('A', 1, 'merenda escolar', base(0))]);

    expect(await store.searchLexical({ consulta: 'ambulancia', vetor: base(0), k: 5 })).toEqual([]);
    expect(await store.searchLexical({ consulta: 'de a o', vetor: base(0), k: 5 })).toEqual([]);
    expect(await store.searchLexical({ consulta: '', vetor: base(0), k: 5 })).toEqual([]);
  });

  it('empate lexical é resolvido por id crescente', async () => {
    const store = obter();
    await store.upsert([
      chunk('b', 1, 'merenda escolar', base(0)),
      chunk('a', 2, 'merenda escolar', base(0)),
    ]);

    expect(ids(await store.searchLexical({ consulta: 'merenda', vetor: base(0), k: 5 }))).toEqual([
      'a',
      'b',
    ]);
  });

  it('k limita e é validado', async () => {
    const store = obter();
    await store.upsert(
      Array.from({ length: 6 }, (_, i) => chunk(`c${i}`, i, 'merenda escolar', base(0)))
    );

    expect(await store.searchLexical({ consulta: 'merenda', vetor: base(0), k: 2 })).toHaveLength(
      2
    );
    await expect(
      store.searchLexical({ consulta: 'merenda', vetor: base(0), k: 0 })
    ).rejects.toBeInstanceOf(TypeError);
  });

  it('consulta hostil (aspas, operadores) não quebra nem injeta sintaxe', async () => {
    const store = obter();
    await store.upsert([chunk('A', 1, 'merenda escolar', base(0))]);

    await expect(
      store.searchLexical({ consulta: '"); DROP TABLE x; -- NEAR( *', vetor: base(0), k: 5 })
    ).resolves.toEqual([]);
  });
}

function contratoFormato(obter) {
  it('traz o mesmo formato da busca vetorial, com score = cosseno contra o vetor da consulta', async () => {
    const store = obter();
    await store.upsert([
      chunk('A', 7, 'merenda escolar', base(0), { ano: 2025 }),
      chunk('B', 8, 'merenda municipal', base(1), { ano: 2025 }),
    ]);

    const r = await store.searchLexical({ consulta: 'merenda', vetor: base(0), k: 5 });
    const a = r.find(x => x.id === 'A');
    const b = r.find(x => x.id === 'B');

    expect(a).toMatchObject({
      docId: 7,
      texto: 'merenda escolar',
      metadados: { ano: 2025 },
      url_origem: 'https://fonte.example/A',
      origemGenerica: false,
    });
    expect(a.score).toBeGreaterThan(0.98);
    expect(b.score).toBeLessThan(0.1);
  });

  it('rejeita vetor de dimensão errada', async () => {
    await expect(
      obter().searchLexical({ consulta: 'merenda', vetor: [1, 0, 0], k: 5 })
    ).rejects.toThrow();
  });
}

function contratoFiltrosEEscrita(obter) {
  it('filtros valem como pré-filtro (AND/IN), inclusive quando o melhor lexical está fora', async () => {
    const store = obter();
    await store.upsert([
      chunk('A', 1, 'merenda merenda merenda escolar', base(0), { ano: 2024 }),
      chunk('B', 2, 'merenda', base(0), { ano: 2025 }),
    ]);

    const r = await store.searchLexical({
      consulta: 'merenda',
      vetor: base(0),
      k: 1,
      filtros: { ano: 2025 },
    });

    expect(ids(r)).toEqual(['B']);
  });

  it('upsert que troca o texto atualiza o índice lexical; deleteByDoc remove', async () => {
    const store = obter();
    await store.upsert([chunk('A', 1, 'merenda escolar', base(0))]);
    await store.upsert([chunk('A', 1, 'ambulancia nova', base(0))]);

    expect(await store.searchLexical({ consulta: 'merenda', vetor: base(0), k: 5 })).toEqual([]);
    expect(
      ids(await store.searchLexical({ consulta: 'ambulancia', vetor: base(0), k: 5 }))
    ).toEqual(['A']);

    await store.deleteByDoc(1);

    expect(await store.searchLexical({ consulta: 'ambulancia', vetor: base(0), k: 5 })).toEqual([]);
  });
}

function contratoIdentificadores(obter) {
  // ids com ordem inversa à do acerto: se o empate for decidido por id, o exato perde
  const semear = store =>
    store.upsert([
      chunk('a1', 1, 'Decreto nº 202/2025 dispõe sobre ponto facultativo', base(0)),
      chunk('a2', 2, 'Decreto nº 13/2025 abre crédito adicional suplementar', base(1)),
      chunk('a3', 3, 'Decreto nº 30/2025 regulamenta o transporte escolar', base(2)),
      chunk('a4', 4, 'Decreto nº 3/2024 nomeia representantes do conselho', base(3)),
      chunk('zz', 5, 'Decreto nº 3/2025 nomeia representantes do conselho', base(4)),
    ]);

  it('número curto de documento (N/AAAA) acha o exato, não os vizinhos de mesmo ano', async () => {
    const store = obter();
    await semear(store);

    const r = await store.searchLexical({
      consulta: 'O que diz o Decreto nº 3/2025?',
      vetor: base(0),
      k: 5,
    });

    expect(ids(r)[0]).toBe('zz');
  });

  it('o mesmo número em outro ano não é confundido', async () => {
    const store = obter();
    await semear(store);

    const r = await store.searchLexical({
      consulta: 'Decreto 3/2024',
      vetor: base(0),
      k: 5,
    });

    expect(ids(r)[0]).toBe('a4');
  });

  it('com ou sem zeros à esquerda: 34/2026 acha 034/2026 e 000034/2026', async () => {
    const store = obter();
    await store.upsert([
      chunk('a1', 1, 'Dispensa 134/2026 materiais de escritório', base(0)),
      chunk('a2', 2, 'Dispensa 340/2026 serviços gerais', base(1)),
      chunk('m1', 3, 'Dispensa 034/2026 distribuidor de esterco líquido', base(2)),
      chunk('m2', 4, 'Pregão eletrônico 000034/2026 aquisição de pneus', base(3)),
    ]);

    const r = await store.searchLexical({
      consulta: 'objeto do processo 34/2026',
      vetor: base(0),
      k: 5,
    });

    expect(ids(r).slice(0, 2).sort()).toEqual(['m1', 'm2']);
  });

  it('número de documento com espaços em volta da barra também vale ("3 / 2025")', async () => {
    const store = obter();
    await semear(store);

    const r = await store.searchLexical({ consulta: 'Decreto 3 / 2025', vetor: base(0), k: 5 });

    expect(ids(r)[0]).toBe('zz');
  });

  it('consulta sem identificador continua funcionando como antes', async () => {
    const store = obter();
    await semear(store);

    const r = await store.searchLexical({ consulta: 'transporte escolar', vetor: base(0), k: 5 });

    expect(ids(r)[0]).toBe('a3');
  });
}

function runLexicalSearchContract(nome, criar, { quantizacoes = ['float32'] } = {}) {
  describe.each(quantizacoes)(`contrato ramo lexical: ${nome} [%s]`, quantizacao => {
    let store;
    beforeEach(() => {
      store = criar({ dims: DIMS, quantizacao });
    });
    const obter = () => store;

    describe('relevância', () => contratoRelevancia(obter));
    describe('formato', () => contratoFormato(obter));
    describe('filtros e escrita', () => contratoFiltrosEEscrita(obter));
    describe('identificadores de documento', () => contratoIdentificadores(obter));
  });
}

module.exports = { runLexicalSearchContract };
