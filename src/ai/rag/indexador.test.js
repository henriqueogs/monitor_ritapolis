'use strict';

const { indexarIncremental } = require('./indexador');
const { criarEstadoIndexacaoMemoria } = require('./estado-indexacao');
const { criarMemoryVectorStore } = require('../vector/memory-vector-store');
const { criarFakeEmbeddingProvider } = require('../adapters/fake-embedding-provider');

const doc = (docId, texto, extra = {}) => ({
  docId,
  texto,
  url_origem: `https://fonte.example/${docId}`,
  metadados: { ano: 2025 },
  ...extra,
});

function ambiente() {
  const provider = criarFakeEmbeddingProvider();
  const chamadas = [];
  const espiao = {
    model: provider.model,
    dims: provider.dims,
    embed: async (textos, opcoes) => {
      chamadas.push(textos.length);
      return provider.embed(textos, opcoes);
    },
  };
  const store = criarMemoryVectorStore({ dims: provider.dims });
  return { provider: espiao, store, estado: criarEstadoIndexacaoMemoria(), chamadas };
}

const pequeno = texto => [texto]; // um chunk por documento

describe('indexarIncremental', () => {
  it('indexa documentos novos: chunks com id estável docId#ordem, origem e metadados', async () => {
    const env = ambiente();

    const r = await indexarIncremental({
      ...env,
      documentos: [doc(1, 'merenda escolar'), doc(2, 'compra de ambulancia')],
      chunker: pequeno,
    });

    expect(r).toMatchObject({ indexados: 2, ignorados: 0, removidos: 0, chunks: 2, pendentes: 0 });
    const [achado] = await env.store.search({
      vetor: (await env.provider.embed(['merenda escolar']))[0],
      k: 1,
    });
    expect(achado).toMatchObject({
      id: '1#0',
      docId: 1,
      url_origem: 'https://fonte.example/1',
      metadados: { ano: 2025 },
    });
  });

  it('segunda execução sem mudança não chama o provedor (só reembeda o que mudou)', async () => {
    const env = ambiente();
    const entrada = {
      ...env,
      documentos: [doc(1, 'merenda'), doc(2, 'ambulancia')],
      chunker: pequeno,
    };
    await indexarIncremental(entrada);
    env.chamadas.length = 0;

    const r = await indexarIncremental(entrada);

    expect(r).toMatchObject({ indexados: 0, ignorados: 2 });
    expect(env.chamadas).toEqual([]);
  });

  it('documento alterado é reindexado; os outros ficam; chunks antigos não sobram', async () => {
    const env = ambiente();
    await indexarIncremental({
      ...env,
      documentos: [doc(1, 'primeiro texto'), doc(2, 'segundo texto')],
      chunker: t => t.split(' '),
    });
    expect(await env.store.count()).toBe(4);
    env.chamadas.length = 0;

    const r = await indexarIncremental({
      ...env,
      documentos: [doc(1, 'novo'), doc(2, 'segundo texto')],
      chunker: t => t.split(' '),
    });

    expect(r).toMatchObject({ indexados: 1, ignorados: 1, chunks: 1 });
    expect(await env.store.count()).toBe(3); // 1 (doc 1) + 2 (doc 2)
  });

  it('mudança só de metadados ou de url_origem também reindexa (filtros e fonte ficam corretos)', async () => {
    const env = ambiente();
    await indexarIncremental({ ...env, documentos: [doc(1, 'merenda')], chunker: pequeno });

    const r = await indexarIncremental({
      ...env,
      documentos: [doc(1, 'merenda', { metadados: { ano: 2026 } })],
      chunker: pequeno,
    });

    expect(r.indexados).toBe(1);
  });

  it('trocar o modelo de embedding invalida tudo (vetores de modelos diferentes não se misturam)', async () => {
    const env = ambiente();
    const documentos = [doc(1, 'merenda')];
    await indexarIncremental({ ...env, documentos, chunker: pequeno });

    const r = await indexarIncremental({
      ...env,
      provider: { ...env.provider, model: 'outro-modelo' },
      documentos,
      chunker: pequeno,
    });

    expect(r.indexados).toBe(1);
  });

  it('removerAusentes apaga do índice e do estado o que saiu da fonte; sem a flag, preserva', async () => {
    const env = ambiente();
    await indexarIncremental({
      ...env,
      documentos: [doc(1, 'merenda'), doc(2, 'ambulancia')],
      chunker: pequeno,
    });

    const sem = await indexarIncremental({
      ...env,
      documentos: [doc(1, 'merenda')],
      chunker: pequeno,
    });
    expect(sem.removidos).toBe(0);
    expect(await env.store.count()).toBe(2);

    const com = await indexarIncremental({
      ...env,
      documentos: [doc(1, 'merenda')],
      chunker: pequeno,
      removerAusentes: true,
    });
    expect(com.removidos).toBe(1);
    expect(await env.store.count()).toBe(1);
    expect(await env.estado.obter(2)).toBeNull();
  });

  it('limite processa só N documentos por execução e informa os pendentes; retoma depois', async () => {
    const env = ambiente();
    const documentos = [doc(1, 'alfa'), doc(2, 'beta'), doc(3, 'gama')];

    const primeira = await indexarIncremental({ ...env, documentos, chunker: pequeno, limite: 2 });
    const segunda = await indexarIncremental({ ...env, documentos, chunker: pequeno, limite: 2 });

    expect(primeira).toMatchObject({ indexados: 2, pendentes: 1 });
    expect(segunda).toMatchObject({ indexados: 1, ignorados: 2, pendentes: 0 });
    expect(await env.store.count()).toBe(3);
  });

  it('falha do provedor no meio mantém o que já foi indexado e o documento que falhou intacto', async () => {
    const env = ambiente();
    await indexarIncremental({ ...env, documentos: [doc(2, 'versao antiga')], chunker: pequeno });
    const quebrado = {
      ...env.provider,
      embed: async textos => {
        if (textos.some(t => t.includes('explode'))) {
          throw new Error('provedor caiu');
        }
        return env.provider.embed(textos);
      },
    };

    await expect(
      indexarIncremental({
        ...env,
        provider: quebrado,
        documentos: [doc(1, 'ok'), doc(2, 'explode agora')],
        chunker: pequeno,
      })
    ).rejects.toThrow(/provedor caiu/);

    expect(await env.store.count()).toBe(2); // doc 1 novo + doc 2 antigo preservado
    const retomada = await indexarIncremental({
      ...env,
      documentos: [doc(1, 'ok'), doc(2, 'explode agora')],
      chunker: pequeno,
    });
    expect(retomada).toMatchObject({ indexados: 1, ignorados: 1 });
  });

  it('documento sem texto útil: remove chunks antigos e não gasta embedding', async () => {
    const env = ambiente();
    await indexarIncremental({ ...env, documentos: [doc(1, 'merenda')], chunker: pequeno });
    env.chamadas.length = 0;

    const r = await indexarIncremental({
      ...env,
      documentos: [doc(1, '   ')],
      chunker: t => (t.trim() ? [t] : []),
    });

    expect(r).toMatchObject({ indexados: 1, chunks: 0 });
    expect(await env.store.count()).toBe(0);
    expect(env.chamadas).toEqual([]);
  });

  it('documento sem url_origem é recusado antes de qualquer gasto (§11.3)', async () => {
    const env = ambiente();

    await expect(
      indexarIncremental({
        ...env,
        documentos: [{ docId: 1, texto: 'x y', metadados: {} }],
        chunker: pequeno,
      })
    ).rejects.toThrow(/url_origem/);
    expect(env.chamadas).toEqual([]);
  });

  it('usa o chunker padrão (chunk-text) quando nenhum é informado e divide textos longos', async () => {
    const env = ambiente();
    const longo = 'palavra '.repeat(600);

    const r = await indexarIncremental({ ...env, documentos: [doc(1, longo)] });

    expect(r.chunks).toBeGreaterThan(1);
    expect(await env.store.count()).toBe(r.chunks);
  });
});

describe('indexarIncremental: robustez (revisão independente)', () => {
  it('mudar a configuração do chunker (versaoChunker) invalida o hash e reindexa', async () => {
    const env = ambiente();
    const base = { ...env, documentos: [doc(1, 'merenda')], chunker: pequeno };
    await indexarIncremental({ ...base, versaoChunker: 'v1' });

    expect((await indexarIncremental({ ...base, versaoChunker: 'v1' })).indexados).toBe(0);
    expect((await indexarIncremental({ ...base, versaoChunker: 'v2' })).indexados).toBe(1);
  });

  it('docId 5 e "5" são o mesmo documento: não duplica chunks nem estado', async () => {
    const env = ambiente();
    await indexarIncremental({ ...env, documentos: [doc(5, 'merenda escolar')], chunker: pequeno });

    const r = await indexarIncremental({
      ...env,
      documentos: [doc('5', 'merenda escolar municipal')],
      chunker: pequeno,
    });

    expect(r.indexados).toBe(1);
    expect(await env.store.count()).toBe(1);
    expect(await env.estado.listarDocIds()).toHaveLength(1);
  });

  it('falha ao trocar os chunks deixa marcador pendente: se o documento sair da fonte, é removido', async () => {
    const env = ambiente();
    const store = {
      ...env.store,
      replaceByDoc: async () => {
        throw new Error('disco cheio');
      },
    };
    await expect(
      indexarIncremental({ ...env, store, documentos: [doc(7, 'merenda')], chunker: pequeno })
    ).rejects.toThrow(/disco cheio/);
    expect(await env.estado.obter('7')).not.toBeNull();

    const r = await indexarIncremental({ ...env, documentos: [], removerAusentes: true });

    expect(r.removidos).toBe(1);
    expect(await env.estado.obter('7')).toBeNull();
  });

  it('troca de chunks acontece numa só operação do store (replaceByDoc), sem janela sem dados', async () => {
    const env = ambiente();
    const chamadas = [];
    const store = {
      ...env.store,
      deleteByDoc: async id => (chamadas.push('delete'), env.store.deleteByDoc(id)),
      replaceByDoc: async (id, chunks) => (
        chamadas.push('replace'),
        env.store.replaceByDoc(id, chunks)
      ),
    };

    await indexarIncremental({ ...env, store, documentos: [doc(1, 'merenda')], chunker: pequeno });

    expect(chamadas).toEqual(['replace']);
  });
});

describe('estado de indexação em memória', () => {
  it('guarda, lê, lista e remove hashes por docId', async () => {
    const estado = criarEstadoIndexacaoMemoria();

    await estado.gravar(1, 'h1');
    await estado.gravar(2, 'h2');

    expect(await estado.obter(1)).toBe('h1');
    expect(await estado.obter(9)).toBeNull();
    expect((await estado.listarDocIds()).sort()).toEqual([1, 2]);
    await estado.remover(1);
    expect(await estado.obter(1)).toBeNull();
  });
});
