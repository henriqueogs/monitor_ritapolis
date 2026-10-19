'use strict';

const { rodarJobIndexacao } = require('./job-indexacao');
const { criarEstadoIndexacaoMemoria } = require('./estado-indexacao');
const { criarMemoryVectorStore } = require('../vector/memory-vector-store');
const { criarFakeEmbeddingProvider } = require('../adapters/fake-embedding-provider');

const TEXTO = 'Aquisição de gêneros alimentícios para a merenda escolar do município. '.repeat(4);
const linhaDoc = id => ({
  id,
  fonte: 'site_prefeitura',
  tipo: 'edital',
  numero: `PP-${id}/2025`,
  ano: 2025,
  titulo: `Pregão ${id}`,
  texto_completo: `${TEXTO} item ${id}`,
  url_origem: 'https://x/lista',
  url_pdf: `https://x/${id}.pdf`,
});
const linhaAnexo = (id, documentoId) => ({
  id,
  documento_id: documentoId,
  nome: `anexo ${id}.pdf`,
  tipo: 'outro',
  url: `https://x/anexo-${id}.pdf`,
  texto_completo: `${TEXTO} anexo ${id}`,
  doc_ano: 2025,
  doc_tipo: 'edital',
  doc_fonte: 'site_prefeitura',
  doc_titulo: `Pregão ${documentoId}`,
});

// leitor falso com paginação por cursor, como o repositório real
function leitor({ documentos = [], anexos = [] }) {
  const pagina = (linhas, { afterId, limite }) =>
    linhas.filter(l => l.id > afterId).slice(0, limite);
  return {
    listarDocumentosParaIndexar: jest.fn(args => pagina(documentos, args)),
    listarAnexosParaIndexar: jest.fn(args => pagina(anexos, args)),
  };
}

function ambiente() {
  const provider = criarFakeEmbeddingProvider();
  const embed = jest.fn((textos, opcoes) => provider.embed(textos, opcoes));
  return {
    provider: { model: provider.model, dims: provider.dims, embed },
    store: criarMemoryVectorStore({ dims: provider.dims }),
    estado: criarEstadoIndexacaoMemoria(),
    embed,
  };
}

const LOG = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const base = { logger: LOG, tamanhoPagina: 2, pausaEntreLotesMs: 0, dormir: async () => {} };

describe('rodarJobIndexacao', () => {
  it('indexa documentos e anexos do leitor e informa o resumo por fonte', async () => {
    const env = ambiente();
    const fontes = leitor({
      documentos: [linhaDoc(1), linhaDoc(2), linhaDoc(3)],
      anexos: [linhaAnexo(10, 1)],
    });

    const r = await rodarJobIndexacao({ ...base, ...env, leitor: fontes });

    expect(r).toMatchObject({ completo: true, indexados: 4, ignorados: 0, pendentes: 0 });
    expect(r.por_fonte).toMatchObject({ documentos: { indexados: 3 }, anexos: { indexados: 1 } });
    expect(await env.store.count()).toBeGreaterThanOrEqual(4);
    expect(await env.estado.obter('documento:1')).not.toBeNull();
    expect(await env.estado.obter('anexo:10')).not.toBeNull();
  });

  it('segunda execução sem mudanças não chama o provedor de embedding', async () => {
    const env = ambiente();
    const fontes = leitor({ documentos: [linhaDoc(1), linhaDoc(2)] });
    await rodarJobIndexacao({ ...base, ...env, leitor: fontes });
    env.embed.mockClear();

    const r = await rodarJobIndexacao({ ...base, ...env, leitor: fontes });

    expect(r).toMatchObject({ indexados: 0, ignorados: 2, completo: true });
    expect(env.embed).not.toHaveBeenCalled();
  });

  it('orçamento de documentos: para no teto, informa pendentes e retoma na execução seguinte', async () => {
    const env = ambiente();
    const fontes = leitor({ documentos: [1, 2, 3, 4, 5].map(linhaDoc) });

    const primeira = await rodarJobIndexacao({
      ...base,
      ...env,
      leitor: fontes,
      orcamento: { maxDocumentos: 2 },
    });
    const segunda = await rodarJobIndexacao({
      ...base,
      ...env,
      leitor: fontes,
      orcamento: { maxDocumentos: 10 },
    });

    expect(primeira).toMatchObject({ indexados: 2, completo: false });
    expect(primeira.pendentes).toBeGreaterThan(0);
    expect(segunda).toMatchObject({ indexados: 3, ignorados: 2, completo: true });
  });

  it('orçamento de tokens estimados: para quando estoura, sem passar muito do teto', async () => {
    const env = ambiente();
    const fontes = leitor({ documentos: [1, 2, 3, 4, 5, 6].map(linhaDoc) });

    const r = await rodarJobIndexacao({
      ...base,
      ...env,
      leitor: fontes,
      orcamento: { maxTokens: 150 },
    });

    expect(r.completo).toBe(false);
    expect(r.indexados).toBeGreaterThan(0);
    expect(r.indexados).toBeLessThan(6);
    expect(r.tokens_estimados).toBeGreaterThanOrEqual(150);
  });

  it('orçamento de tempo: respeita o relógio injetado', async () => {
    const env = ambiente();
    let t = 0;
    const fontes = leitor({ documentos: [1, 2, 3, 4].map(linhaDoc) });

    const r = await rodarJobIndexacao({
      ...base,
      ...env,
      leitor: fontes,
      orcamento: { maxMs: 1000 },
      agora: () => (t += 1500),
    });

    expect(r.completo).toBe(false);
    expect(r.indexados).toBeLessThan(4);
  });

  it('removerAusentes só vale em passada completa: documento que sumiu da fonte sai do índice', async () => {
    const env = ambiente();
    await rodarJobIndexacao({
      ...base,
      ...env,
      leitor: leitor({ documentos: [linhaDoc(1), linhaDoc(2)] }),
    });

    const r = await rodarJobIndexacao({
      ...base,
      ...env,
      leitor: leitor({ documentos: [linhaDoc(1)] }),
      removerAusentes: true,
    });

    expect(r.removidos).toBe(1);
    expect(await env.estado.obter('documento:2')).toBeNull();
  });

  it('removerAusentes NÃO apaga nada quando o orçamento interrompeu a passada', async () => {
    const env = ambiente();
    await rodarJobIndexacao({
      ...base,
      ...env,
      leitor: leitor({ documentos: [linhaDoc(1), linhaDoc(2), linhaDoc(3)] }),
    });

    const alterado = { ...linhaDoc(1), texto_completo: `${TEXTO} versão nova` };

    const r = await rodarJobIndexacao({
      ...base,
      ...env,
      leitor: leitor({ documentos: [alterado] }),
      removerAusentes: true,
      orcamento: { maxDocumentos: 0 },
    });

    expect(r).toMatchObject({ completo: false, pendentes: 1, removidos: 0 });
    expect(await env.estado.obter('documento:2')).not.toBeNull();
  });

  it('orçamento esgotado sobre acervo todo indexado: pendentes 0 e passada completa (não é falso incompleto)', async () => {
    const env = ambiente();
    const fontes = leitor({ documentos: [1, 2, 3].map(linhaDoc) });
    await rodarJobIndexacao({ ...base, ...env, leitor: fontes });

    const r = await rodarJobIndexacao({
      ...base,
      ...env,
      leitor: fontes,
      orcamento: { maxDocumentos: 0 },
    });

    expect(r).toMatchObject({ completo: true, pendentes: 0, ignorados: 3 });
  });

  it('varrer páginas já indexadas não gasta o orçamento de tempo (o trabalho novo ainda acontece)', async () => {
    const env = ambiente();
    await rodarJobIndexacao({
      ...base,
      ...env,
      leitor: leitor({ documentos: [1, 2, 3, 4].map(linhaDoc) }),
    });
    let t = 0;
    const mais = leitor({ documentos: [1, 2, 3, 4, 5, 6].map(linhaDoc) });

    const r = await rodarJobIndexacao({
      ...base,
      ...env,
      leitor: mais,
      orcamento: { maxMs: 1000 },
      agora: () => (t += 700),
    });

    expect(r.indexados).toBeGreaterThan(0);
    expect(r.ignorados).toBe(4);
  });

  it('removerAusentes com leitura vazia não apaga o índice inteiro', async () => {
    const env = ambiente();
    await rodarJobIndexacao({ ...base, ...env, leitor: leitor({ documentos: [linhaDoc(1)] }) });

    const r = await rodarJobIndexacao({
      ...base,
      ...env,
      leitor: leitor({}),
      removerAusentes: true,
    });

    expect(r.removidos).toBe(0);
    expect(await env.estado.obter('documento:1')).not.toBeNull();
  });

  it.each([0, -1, 1.5, NaN, 101])('tamanho de página inválido (%p) é rejeitado', async pagina => {
    const env = ambiente();

    await expect(
      rodarJobIndexacao({
        ...base,
        ...env,
        leitor: leitor({ documentos: [linhaDoc(1)] }),
        tamanhoPagina: pagina,
      })
    ).rejects.toThrow(/tamanhoPagina/);
  });

  it('orçamento de tokens vale dentro da página: não embeda além do teto restante', async () => {
    const env = ambiente();
    const fontes = leitor({ documentos: [1, 2, 3, 4].map(linhaDoc) });

    const r = await rodarJobIndexacao({
      ...base,
      ...env,
      leitor: fontes,
      tamanhoPagina: 10,
      orcamento: { maxTokens: 100 },
    });

    expect(r.indexados).toBeLessThan(4);
    expect(r.completo).toBe(false);
  });

  it('simular: conta o que seria indexado e estima tokens sem embedar nem gravar', async () => {
    const env = ambiente();
    const fontes = leitor({
      documentos: [linhaDoc(1), linhaDoc(2)],
      anexos: [linhaAnexo(10, 1)],
    });

    const r = await rodarJobIndexacao({ ...base, ...env, leitor: fontes, simular: true });

    expect(r).toMatchObject({ simulado: true, indexados: 3 });
    expect(r.tokens_estimados).toBeGreaterThan(0);
    expect(env.embed).not.toHaveBeenCalled();
    expect(await env.store.count()).toBe(0);
    expect(await env.estado.obter('documento:1')).toBeNull();
  });

  it('linhas sem texto útil ou sem origem são descartadas e contadas, sem derrubar o job', async () => {
    const env = ambiente();
    const ruim = { ...linhaDoc(2), texto_completo: 'curto' };
    const semOrigem = { ...linhaDoc(3), url_pdf: null, url_origem: '' };
    const fontes = leitor({ documentos: [linhaDoc(1), ruim, semOrigem] });

    const r = await rodarJobIndexacao({ ...base, ...env, leitor: fontes });

    expect(r).toMatchObject({ indexados: 1, descartados: 2, completo: true });
  });

  it('falha do provedor aborta o job com o erro original e mantém o que já foi indexado', async () => {
    const env = ambiente();
    let chamadas = 0;
    const provider = {
      ...env.provider,
      embed: async (textos, opcoes) => {
        chamadas += 1;
        if (chamadas > 1) {
          throw new Error('429 do provedor');
        }
        return env.provider.embed(textos, opcoes);
      },
    };
    const fontes = leitor({ documentos: [1, 2, 3].map(linhaDoc) });

    await expect(rodarJobIndexacao({ ...base, ...env, provider, leitor: fontes })).rejects.toThrow(
      /429 do provedor/
    );

    expect(await env.estado.obter('documento:1')).not.toBeNull();
  });

  it('pausa entre lotes usa o dormir injetado (respeita limite da chave compartilhada)', async () => {
    const env = ambiente();
    const dormir = jest.fn().mockResolvedValue();
    const fontes = leitor({ documentos: [1, 2, 3, 4].map(linhaDoc) });

    await rodarJobIndexacao({ ...base, ...env, leitor: fontes, pausaEntreLotesMs: 500, dormir });

    expect(dormir).toHaveBeenCalledWith(500);
  });
});
