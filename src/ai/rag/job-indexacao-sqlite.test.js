'use strict';

// Integração do job com o índice real (sqlite-vec + FTS5) e o estado em SQLite no mesmo arquivo.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { rodarJobIndexacao } = require('./job-indexacao');
const { criarEstadoIndexacaoSqlite } = require('./estado-indexacao');
const { criarRecuperadorHibrido } = require('./recuperador-hibrido');
const { criarSqliteVecStore, abrirBancoVetorial } = require('../vector/sqlite-vec-store');
const { criarFakeEmbeddingProvider } = require('../adapters/fake-embedding-provider');

const LOG = { info: () => {}, warn: () => {}, error: () => {} };
const TEXTO = 'Aquisição de ambulância para a secretaria municipal de saúde. '.repeat(4);

const leitor = {
  listarDocumentosParaIndexar: ({ afterId, limite }) =>
    [
      {
        id: 1,
        fonte: 'site_prefeitura',
        tipo: 'edital',
        numero: 'PP-001/2025',
        ano: 2025,
        titulo: 'Pregão ambulância',
        texto_completo: TEXTO,
        url_origem: 'https://x/lista',
        url_pdf: 'https://x/1.pdf',
      },
    ]
      .filter(l => l.id > afterId)
      .slice(0, limite),
  listarAnexosParaIndexar: () => [],
};

describe('rodarJobIndexacao com sqlite-vec', () => {
  it('indexa em arquivo, reabre sem reembedar e a busca híbrida acha o documento com a origem', async () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'job-idx-'));
    const arquivo = path.join(pasta, 'v.db');
    const embedder = criarFakeEmbeddingProvider();
    const embed = jest.fn((t, o) => embedder.embed(t, o));
    const provider = { model: embedder.model, dims: embedder.dims, embed };
    try {
      const db1 = abrirBancoVetorial(arquivo);
      const primeira = await rodarJobIndexacao({
        leitor,
        provider,
        logger: LOG,
        store: criarSqliteVecStore({ db: db1, dims: provider.dims, quantizacao: 'int8' }),
        estado: criarEstadoIndexacaoSqlite(db1),
      });
      db1.close();

      embed.mockClear();
      const db2 = abrirBancoVetorial(arquivo);
      const store = criarSqliteVecStore({ db: db2, dims: provider.dims, quantizacao: 'int8' });
      const segunda = await rodarJobIndexacao({
        leitor,
        provider,
        logger: LOG,
        store,
        estado: criarEstadoIndexacaoSqlite(db2),
      });
      const achados = await criarRecuperadorHibrido({ provider, store })('ambulância saúde', {
        k: 3,
      });
      db2.close();

      expect(primeira).toMatchObject({ indexados: 1, completo: true });
      expect(segunda).toMatchObject({ indexados: 0, ignorados: 1 });
      expect(embed).toHaveBeenCalledTimes(1); // só a pergunta; nenhum documento reembedado
      expect(achados[0]).toMatchObject({
        docId: 'documento:1',
        url_origem: 'https://x/1.pdf',
        origemGenerica: false,
        metadados: { ano: 2025, tipo: 'edital', fonte: 'site_prefeitura' },
      });
    } finally {
      fs.rmSync(pasta, { recursive: true, force: true });
    }
  });
});
