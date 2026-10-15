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
