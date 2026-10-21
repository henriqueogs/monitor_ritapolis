'use strict';

const { criarRecuperadorHibrido } = require('./recuperador-hibrido');
const { criarMemoryVectorStore } = require('../vector/memory-vector-store');
const { criarFakeEmbeddingProvider } = require('../adapters/fake-embedding-provider');
const { indexarCorpus } = require('../eval/recuperador-vetorial');

const corpus = [
  {
    id: 'proc',
    docId: 1,
    texto: 'Processo PP-017/2025 contrato de manutenção de elevadores',
    url_origem: 'https://f/1',
    metadados: { ano: 2025 },
  },
  {
    id: 'merenda',
    docId: 2,
    texto: 'Pregão para aquisição de gêneros alimentícios da merenda escolar',
    url_origem: 'https://f/2',
    metadados: { ano: 2025 },
  },
  {
    id: 'saude',
    docId: 3,
    texto: 'Compra de medicamentos para a farmácia municipal',
    url_origem: 'https://f/3',
    metadados: { ano: 2024 },
  },
];

async function montar({ comLexical = true } = {}) {
  const provider = criarFakeEmbeddingProvider();
  const store = criarMemoryVectorStore({ dims: provider.dims, quantizacao: 'int8' });
  await indexarCorpus({ provider, store, corpus });
  const usado = comLexical ? store : { search: store.search, upsert: store.upsert };
  return { provider, store: usado };
}

describe('criarRecuperadorHibrido (FTS5/BM25 + vetor + RRF, ADR 0003)', () => {
  it('identificador exato é recuperado pelo ramo lexical e marcado como tal', async () => {
    const { provider, store } = await montar();
    const recuperar = criarRecuperadorHibrido({ provider, store });

    const r = await recuperar('PP-017/2025', { k: 3 });

    expect(r[0].id).toBe('proc');
    expect(r[0].ramos).toContain('lexical');
  });

  it('mantém o formato do recuperador vetorial: score é cosseno e url_origem vem do chunk', async () => {
    const { provider, store } = await montar();
    const recuperar = criarRecuperadorHibrido({ provider, store });

    const [primeiro] = await recuperar('merenda escolar', { k: 3 });

    expect(primeiro).toMatchObject({ id: 'merenda', url_origem: 'https://f/2', docId: 2 });
    expect(primeiro.score).toBeGreaterThan(-1);
    expect(primeiro.score).toBeLessThanOrEqual(1);
    expect(primeiro.scoreRrf).toBeGreaterThan(0);
  });

  it('item achado pelos dois ramos tem scoreRrf maior que o achado por um só', async () => {
    const { provider, store } = await montar();
    const recuperar = criarRecuperadorHibrido({ provider, store });

    const r = await recuperar('merenda escolar', { k: 3 });
    const ambos = r.find(x => x.ramos.length === 2);
    const um = r.find(x => x.ramos.length === 1);

    expect(ambos).toBeDefined();
    if (um) {
      expect(ambos.scoreRrf).toBeGreaterThan(um.scoreRrf);
    }
  });

  it('filtros de metadados valem nos dois ramos', async () => {
    const { provider, store } = await montar();
    const recuperar = criarRecuperadorHibrido({ provider, store });

    const r = await recuperar('medicamentos farmácia merenda', { k: 5, filtros: { ano: 2025 } });

    expect(r.every(x => x.metadados.ano === 2025)).toBe(true);
  });

  it('respeita k e devolve sem duplicar chunks', async () => {
    const { provider, store } = await montar();
    const recuperar = criarRecuperadorHibrido({ provider, store });

    const r = await recuperar('compra aquisição pregão contrato', { k: 2 });

    expect(r).toHaveLength(2);
    expect(new Set(r.map(x => x.id)).size).toBe(2);
  });

  it('store sem ramo lexical degrada para vetor puro (ramos = [vetor])', async () => {
    const { provider, store } = await montar({ comLexical: false });
    const recuperar = criarRecuperadorHibrido({ provider, store });

    const r = await recuperar('merenda escolar', { k: 2 });

    expect(r.length).toBeGreaterThan(0);
    expect(r.every(x => x.ramos.join() === 'vetor')).toBe(true);
  });

  it('pergunta sem termos úteis ainda responde pelo ramo vetorial', async () => {
    const { provider, store } = await montar();
    const recuperar = criarRecuperadorHibrido({ provider, store });

    const r = await recuperar('de a o', { k: 2 });

    expect(r.every(x => x.ramos.join() === 'vetor')).toBe(true);
  });

  it('candidatos por ramo cobrem mais que k (a fusão tem de onde escolher)', async () => {
    const provider = criarFakeEmbeddingProvider();
    const chamadas = [];
    const store = {
      search: async args => (chamadas.push(['vetor', args.k]), []),
      searchLexical: async args => (chamadas.push(['lexical', args.k]), []),
    };

    await criarRecuperadorHibrido({ provider, store, fatorCandidatos: 4 })('q', { k: 5 });

    expect(chamadas).toEqual(
      expect.arrayContaining([
        ['vetor', 20],
        ['lexical', 20],
      ])
    );
  });
});

describe('criarRecuperadorHibrido: identificador de documento na pergunta (N/AAAA)', () => {
  const item = (id, texto, score = 0.4) => ({
    id,
    docId: id,
    texto,
    score,
    url_origem: `https://f/${id}`,
    origemGenerica: false,
    metadados: {},
  });
  const vizinhos = [
    item('a1', 'Decreto nº 202/2025 dispõe sobre ponto facultativo'),
    item('a2', 'Decreto nº 13/2025 abre crédito suplementar'),
    item('a3', 'Decreto nº 30/2025 regulamenta o transporte'),
    item('a4', 'Decreto nº 3/2024 nomeia representantes'),
    item('a5', 'Decreto nº 250/2025 trata de feriado'),
  ];
  const exato = item('x', 'Decreto nº 3/2025 nomeia representantes do conselho', 0.31);

  // exato só no ramo lexical (fora do top do vetor): sem promoção o RRF o derruba para fora do top-k
  function montarFalso() {
    const provider = criarFakeEmbeddingProvider();
    const store = {
      search: async () => vizinhos,
      searchLexical: async () => [exato, ...vizinhos.slice(0, 4)],
    };
    return criarRecuperadorHibrido({ provider, store });
  }

  it('chunk que cita o identificador vai para o topo, mesmo achado só pelo ramo lexical', async () => {
    const r = await montarFalso()('O que diz o Decreto nº 3/2025?', { k: 3 });

    expect(r[0].id).toBe('x');
    expect(r).toHaveLength(3);
  });

  it('o promovido mantém ramos, scoreRrf e o cosseno (evidência) originais', async () => {
    const [primeiro] = await montarFalso()('Decreto 3/2025', { k: 3 });

    expect(primeiro).toMatchObject({ id: 'x', ramos: ['lexical'], score: 0.31 });
    expect(primeiro.scoreRrf).toBeGreaterThan(0);
  });

  it('sem identificador na pergunta a ordem continua sendo a do RRF', async () => {
    const r = await montarFalso()('O que diz o Decreto de nomeação?', { k: 3 });

    expect(r.map(x => x.id)).not.toContain('x');
    expect(r[0].id).toBe('a1');
  });

  it('não promove quem só tem número parecido (30/2025, 3/2024) nem tokens fora de ordem', async () => {
    const provider = criarFakeEmbeddingProvider();
    const store = {
      search: async () => vizinhos,
      searchLexical: async () => [vizinhos[2], vizinhos[3], item('p', 'Ano 2025 artigo 3 decreto')],
    };
    const recuperar = criarRecuperadorHibrido({ provider, store });

    const comIdentificador = await recuperar('Decreto 3/2025', { k: 5 });
    const semIdentificador = await recuperar('Decreto', { k: 5 }); // ordem pura do RRF

    expect(comIdentificador.map(x => x.id)).toEqual(semIdentificador.map(x => x.id));
  });

  it('reconhece o identificador com zeros à esquerda no texto (003/2025, 000003/2025)', async () => {
    const provider = criarFakeEmbeddingProvider();
    const comZeros = item('z', 'Decreto nº 000003/2025 nomeia representantes', 0.33);
    const store = {
      search: async () => vizinhos,
      searchLexical: async () => [vizinhos[0], vizinhos[1], comZeros],
    };

    const r = await criarRecuperadorHibrido({ provider, store })('Decreto nº 3/2025', { k: 3 });

    expect(r[0].id).toBe('z');
  });

  it('sem duplicar: o promovido aparece uma vez e o total respeita k', async () => {
    const provider = criarFakeEmbeddingProvider();
    const store = {
      search: async () => [exato, ...vizinhos],
      searchLexical: async () => [exato, ...vizinhos],
    };

    const r = await criarRecuperadorHibrido({ provider, store })('Decreto 3/2025', { k: 4 });

    expect(r).toHaveLength(4);
    expect(new Set(r.map(x => x.id)).size).toBe(4);
    expect(r[0].id).toBe('x');
  });
});
