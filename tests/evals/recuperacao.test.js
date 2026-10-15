'use strict';

/**
 * Gate de qualidade da RECUPERAÇÃO (ADR 0006): roda offline, no CI, sem LLM.
 * Usa o embedder falso (hash de palavras) — valida a mecânica de indexação, filtros,
 * quantização e a lógica do eval. NÃO é gate de qualidade semântica: o dataset foi escrito
 * olhando o corpus e o embedder falso compartilha palavras com ele. A qualidade do modelo real
 * será medida com o eval de geração/recuperação sob demanda (Fase 1), com dataset de perguntas reais.
 */

const corpus = require('./corpus-fixture.json');
const dataset = require('./dataset-ouro.json');
const { criarFakeEmbeddingProvider } = require('../../src/ai/adapters/fake-embedding-provider');
const { criarMemoryVectorStore } = require('../../src/ai/vector/memory-vector-store');
const {
  indexarCorpus,
  criarRecuperadorVetorial,
} = require('../../src/ai/eval/recuperador-vetorial');
const {
  rodarEvalRecuperacao,
  verificarLimiares,
  formatarRelatorio,
} = require('../../src/ai/eval/eval-recuperacao');

// Mínimos do gate. Suba conforme o dataset real crescer; nunca desça para fazer o CI passar.
const LIMIARES = { recall_medio: 1, mrr: 0.75, recusa_correta_pct: 1 };

async function rodar(quantizacao) {
  const provider = criarFakeEmbeddingProvider();
  const store = criarMemoryVectorStore({ dims: provider.dims, quantizacao });
  await indexarCorpus({ provider, store, corpus });
  const relatorio = await rodarEvalRecuperacao({
    dataset,
    recuperar: criarRecuperadorVetorial({ provider, store }),
  });
  if (process.env.EVAL_VERBOSE) {
    process.stdout.write(`${formatarRelatorio(relatorio)}\n`);
  }
  return relatorio;
}

describe.each(['float32', 'int8'])('eval de recuperação — dataset ouro [%s]', quantizacao => {
  it('atinge os limiares do gate', async () => {
    const { resumo } = await rodar(quantizacao);

    const gate = verificarLimiares(resumo, LIMIARES);

    expect(gate.falhas).toEqual([]);
    expect(gate.passou).toBe(true);
  });

  it('cada pergunta com fonte esperada encontra o documento certo no top-5', async () => {
    const { perguntas } = await rodar(quantizacao);

    for (const p of perguntas.filter(x => x.tipo === 'recuperacao')) {
      expect({ id: p.id, recall: p.recall }).toEqual({ id: p.id, recall: 1 });
    }
  });

  it('o filtro por ano restringe a recuperação (q4 só vê documentos de 2026)', async () => {
    const provider = criarFakeEmbeddingProvider();
    const store = criarMemoryVectorStore({ dims: provider.dims, quantizacao });
    await indexarCorpus({ provider, store, corpus });
    const recuperar = criarRecuperadorVetorial({ provider, store });

    const r = await recuperar('Que obra de pavimentação foi contratada?', {
      k: 10,
      filtros: { ano: 2026 },
    });

    expect(r.length).toBeGreaterThan(0);
    expect(r.every(x => x.metadados.ano === 2026)).toBe(true);
  });
});

describe('o gate realmente reprova quando a recuperação piora', () => {
  it('acerto fora do top-k (posição 6) derruba o recall e o gate', async () => {
    const certo = {
      1: 'q1-merenda',
      2: 'q2-limpeza',
      3: 'q3-ambulancia',
      8: 'q4-pavimentacao-2026',
    };
    const recuperar = async pergunta => {
      const item = dataset.find(d => d.pergunta === pergunta);
      const docId = Number(Object.keys(certo).find(d => certo[d] === item.id) || 0);
      return [
        ...Array.from({ length: 5 }, (_, i) => ({ docId: 100 + i, score: 0.9 })),
        { docId, score: 0.5 },
      ];
    };

    const { resumo } = await rodarEvalRecuperacao({ dataset, recuperar, k: 5 });

    expect(resumo.recall_medio).toBe(0);
    expect(verificarLimiares(resumo, LIMIARES).passou).toBe(false);
  });

  it('limiar de evidência frouxo demais aprova uma recusa que deveria falhar', async () => {
    const recuperar = async () => [{ docId: 5, score: 0.3 }];

    const rigido = await rodarEvalRecuperacao({ dataset, recuperar, limiarEvidencia: 0.2 });
    const frouxo = await rodarEvalRecuperacao({ dataset, recuperar, limiarEvidencia: 0.9 });

    expect(rigido.resumo.recusa_correta_pct).toBe(0);
    expect(frouxo.resumo.recusa_correta_pct).toBe(1);
  });

  it('um recuperador que ignora a pergunta não passa nos limiares', async () => {
    const { resumo } = await rodarEvalRecuperacao({
      dataset,
      recuperar: async () => [{ docId: 10, score: 0.9 }],
    });

    expect(verificarLimiares(resumo, LIMIARES).passou).toBe(false);
  });
});
