'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { criarServicoPadrao } = require('./servico-padrao');
const { criarFakeEmbeddingProvider } = require('../adapters/fake-embedding-provider');
const { criarSqliteVecStore, abrirBancoVetorial } = require('../vector/sqlite-vec-store');
const { indexarCorpus } = require('../eval/recuperador-vetorial');

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const llmFalso = () => ({
  provider: 'teste',
  model: 'llm-teste',
  generateJson: jest.fn().mockResolvedValue({
    recusou: false,
    resposta: 'A empresa Alimentos Minas venceu.',
    citacoes: [
      {
        doc_id: 1,
        trecho: 'Alimentos Minas Ltda foi declarada vencedora',
        url_origem: 'https://fonte.example/1',
      },
    ],
  }),
});

describe('criarServicoPadrao', () => {
  it('kill-switch desligado: devolve null sem abrir banco nem criar provedores', () => {
    const abrirBanco = jest.fn();

    const servico = criarServicoPadrao({
      config: { aiAskEnabled: false, aiVectorDbPath: 'x.db' },
      logger,
      fabricas: { abrirBanco },
    });

    expect(servico).toBeNull();
    expect(abrirBanco).not.toHaveBeenCalled();
  });

  it('ligado mas sem arquivo de índice: null e aviso (não derruba o boot da API)', () => {
    const servico = criarServicoPadrao({
      config: { aiAskEnabled: true, aiVectorDbPath: path.join(os.tmpdir(), 'nao-existe-xyz.db') },
      logger,
      fabricas: {},
    });

    expect(servico).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('índice com dimensão diferente: null, aviso e o arquivo não fica travado', async () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'servico-dims-'));
    const arquivo = path.join(pasta, 'v.db');
    try {
      const db = abrirBancoVetorial(arquivo);
      criarSqliteVecStore({ db, dims: 8 });
      db.close();

      const servico = criarServicoPadrao({
        config: { aiAskEnabled: true, aiVectorDbPath: arquivo, aiAskQuantizacao: 'float32' },
        logger,
        fabricas: { criarEmbedding: () => criarFakeEmbeddingProvider(), criarLlm: llmFalso },
      });

      expect(servico).toBeNull();
      expect(() => fs.rmSync(pasta, { recursive: true, force: true })).not.toThrow();
    } finally {
      fs.rmSync(pasta, { recursive: true, force: true });
    }
  });

  it('ligado com índice: monta recuperador híbrido + LLM e responde com citação verificada', async () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'servico-padrao-'));
    const arquivo = path.join(pasta, 'v.db');
    const embedder = criarFakeEmbeddingProvider();
    const db = abrirBancoVetorial(arquivo);
    try {
      const store = criarSqliteVecStore({ db, dims: embedder.dims, quantizacao: 'int8' });
      await indexarCorpus({
        provider: embedder,
        store,
        corpus: [
          {
            id: '1#0',
            docId: 1,
            texto: 'A empresa Alimentos Minas Ltda foi declarada vencedora do pregão eletrônico.',
            url_origem: 'https://fonte.example/1',
          },
        ],
      });
      db.close();

      const servico = criarServicoPadrao({
        config: {
          aiAskEnabled: true,
          aiVectorDbPath: arquivo,
          aiAskLimiar: 0.1,
          aiAskDailyLimit: 10,
          aiAskQuantizacao: 'int8',
        },
        logger,
        fabricas: { criarEmbedding: () => embedder, criarLlm: llmFalso },
      });

      const r = await servico.perguntar({ pergunta: 'Qual empresa venceu o pregão eletrônico?' });
      servico.fechar();

      expect(r.recusou).toBe(false);
      expect(r.fontes).toEqual([
        { docId: 1, url_origem: 'https://fonte.example/1', origemGenerica: false },
      ]);
    } finally {
      fs.rmSync(pasta, { recursive: true, force: true });
    }
  });
});
