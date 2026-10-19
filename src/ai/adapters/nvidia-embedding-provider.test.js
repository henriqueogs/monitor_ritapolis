'use strict';

const { runEmbeddingProviderContract } = require('../ports/contracts/embedding-provider.contract');
const { criarNvidiaEmbeddingProvider, LOTE_MAXIMO } = require('./nvidia-embedding-provider');
const { DimensaoInesperadaError } = require('../ports/errors');

const DIMS = 16;
const MODELO = 'nvidia/nemotron-3-embed-1b';

function vetorDe(texto, dims = DIMS) {
  const v = Array.from({ length: dims }, () => 0);
  for (let i = 0; i < texto.length; i += 1) {
    v[(i * 7 + texto.charCodeAt(i)) % dims] += texto.charCodeAt(i) / 100;
  }
  return v;
}

/** Cliente no formato do SDK `openai`, sem rede. Devolve `data` fora de ordem para provar a ordenação por index. */
function clienteSimulado({ falha, dims = DIMS } = {}) {
  const create = jest.fn(async ({ input }) => {
    if (falha) {
      throw falha;
    }
    return { data: input.map((t, index) => ({ index, embedding: vetorDe(t, dims) })).reverse() };
  });
  return { embeddings: { create } };
}

const criar = opts =>
  criarNvidiaEmbeddingProvider({ client: clienteSimulado(opts), modelo: MODELO, dims: DIMS });

runEmbeddingProviderContract('NVIDIA (cliente simulado)', {
  criar: () => criar(),
  criarMorto: () =>
    criar({ falha: Object.assign(new Error('410 status code (no body)'), { status: 410 }) }),
  criarLimitado: () =>
    criar({
      falha: Object.assign(new Error('429'), { status: 429, headers: { 'retry-after': '2' } }),
    }),
});

describe('adaptador NVIDIA: detalhes do protocolo', () => {
  it('divide em lotes de no máximo LOTE_MAXIMO e junta na ordem', async () => {
    const client = clienteSimulado();
    const p = criarNvidiaEmbeddingProvider({ client, modelo: MODELO, dims: DIMS });
    const textos = Array.from({ length: LOTE_MAXIMO * 2 + 44 }, (_, i) => `texto ${i}`);

    const r = await p.embed(textos);

    const tamanhos = client.embeddings.create.mock.calls.map(([args]) => args.input.length);
    expect(tamanhos).toEqual([LOTE_MAXIMO, LOTE_MAXIMO, 44]);
    expect(r).toHaveLength(textos.length);
    expect(r[LOTE_MAXIMO]).toEqual(vetorDe('texto 128'));
  });

  it('envia modelo, input_type (passage por padrão), truncate END e formato float', async () => {
    const client = clienteSimulado();
    const p = criarNvidiaEmbeddingProvider({ client, modelo: MODELO, dims: DIMS });

    await p.embed(['a']);
    await p.embed(['b'], { tipo: 'query' });

    const [primeira, segunda] = client.embeddings.create.mock.calls.map(([args]) => args);
    expect(primeira).toMatchObject({
      model: MODELO,
      input_type: 'passage',
      truncate: 'END',
      encoding_format: 'float',
    });
    expect(segunda.input_type).toBe('query');
  });

  it('dimensão diferente da esperada falha com DimensaoInesperadaError (índice inconsistente)', async () => {
    const p = criarNvidiaEmbeddingProvider({
      client: clienteSimulado({ dims: 4 }),
      modelo: MODELO,
      dims: DIMS,
    });

    await expect(p.embed(['x'])).rejects.toBeInstanceOf(DimensaoInesperadaError);
  });

  it('não chama a API para lista vazia', async () => {
    const client = clienteSimulado();
    const p = criarNvidiaEmbeddingProvider({ client, modelo: MODELO, dims: DIMS });

    await p.embed([]);

    expect(client.embeddings.create).not.toHaveBeenCalled();
  });

  it('exige client, modelo e dims na criação', () => {
    expect(() => criarNvidiaEmbeddingProvider({ modelo: MODELO, dims: DIMS })).toThrow(/client/);
    expect(() => criarNvidiaEmbeddingProvider({ client: clienteSimulado(), dims: DIMS })).toThrow(
      /modelo/
    );
    expect(() =>
      criarNvidiaEmbeddingProvider({ client: clienteSimulado(), modelo: MODELO })
    ).toThrow(/dims/);
  });

  it('o retryAfterMs do 429 chega ao chamador', async () => {
    const erro = Object.assign(new Error('429'), { status: 429, headers: { 'retry-after': '2' } });
    const p = criarNvidiaEmbeddingProvider({
      client: clienteSimulado({ falha: erro }),
      modelo: MODELO,
      dims: DIMS,
    });

    await expect(p.embed(['x'])).rejects.toMatchObject({ retryAfterMs: 2000 });
  });
});

describe('adaptador NVIDIA: entradas e respostas malformadas', () => {
  const novo = client =>
    criarNvidiaEmbeddingProvider({
      client: client || clienteSimulado(),
      modelo: MODELO,
      dims: DIMS,
    });

  it.each([0, -1, 1.5])(
    'loteMaximo inválido (%p) falha na criação (evita laço infinito)',
    loteMaximo => {
      expect(() =>
        criarNvidiaEmbeddingProvider({
          client: clienteSimulado(),
          modelo: MODELO,
          dims: DIMS,
          loteMaximo,
        })
      ).toThrow(/loteMaximo/);
    }
  );

  it('textos que não é lista, ou com item vazio/não-texto, rejeita com TypeError sem chamar a API', async () => {
    const client = clienteSimulado();
    const p = novo(client);

    await expect(p.embed(null)).rejects.toBeInstanceOf(TypeError);
    await expect(p.embed(['ok', ''])).rejects.toBeInstanceOf(TypeError);
    await expect(p.embed(['ok', 42])).rejects.toBeInstanceOf(TypeError);
    expect(client.embeddings.create).not.toHaveBeenCalled();
  });

  it('resposta sem data → erro com o modelo no contexto', async () => {
    const client = { embeddings: { create: jest.fn(async () => ({})) } };

    await expect(novo(client).embed(['a'])).rejects.toThrow(new RegExp(MODELO));
  });

  it('resposta com menos vetores que textos → erro (não desalinha em silêncio)', async () => {
    const client = {
      embeddings: {
        create: jest.fn(async () => ({ data: [{ index: 0, embedding: vetorDe('a') }] })),
      },
    };

    await expect(novo(client).embed(['a', 'b'])).rejects.toThrow(/2/);
  });

  it('índices duplicados ou fora da faixa → erro', async () => {
    const dup = {
      embeddings: {
        create: jest.fn(async () => ({
          data: [
            { index: 0, embedding: vetorDe('a') },
            { index: 0, embedding: vetorDe('b') },
          ],
        })),
      },
    };
    const fora = {
      embeddings: {
        create: jest.fn(async () => ({
          data: [
            { index: 0, embedding: vetorDe('a') },
            { index: 5, embedding: vetorDe('b') },
          ],
        })),
      },
    };

    await expect(novo(dup).embed(['a', 'b'])).rejects.toThrow();
    await expect(novo(fora).embed(['a', 'b'])).rejects.toThrow();
  });
});
