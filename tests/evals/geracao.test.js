'use strict';

/**
 * Gate de GERAÇÃO (ADR 0005/0006), offline: recuperação real da mecânica (embedder falso) +
 * LLM simulado. Prova que o runner distingue um LLM fiel de LLMs que alucinam, omitem citação,
 * acusam ou saem do contrato, e que o gate reprova os maus. A qualidade do MODELO REAL é medida
 * sob demanda com `npm run eval:ia -- --real` e comparada com `--comparar`.
 */

const corpus = require('./corpus-fixture.json');
const dataset = require('./dataset-ouro.json');
const { criarFakeEmbeddingProvider } = require('../../src/ai/adapters/fake-embedding-provider');
const { criarMemoryVectorStore } = require('../../src/ai/vector/memory-vector-store');
const {
  indexarCorpus,
  criarRecuperadorVetorial,
} = require('../../src/ai/eval/recuperador-vetorial');
const { verificarLimiares } = require('../../src/ai/eval/eval-recuperacao');
const {
  rodarEvalGeracao,
  MINIMOS_GERACAO,
  MAXIMOS_GERACAO,
} = require('../../src/ai/eval/eval-geracao');
const { criarLLMSimulado } = require('../../src/ai/eval/llm-simulado');

async function rodar(comportamento) {
  const provider = criarFakeEmbeddingProvider();
  const store = criarMemoryVectorStore({ dims: provider.dims, quantizacao: 'int8' });
  await indexarCorpus({ provider, store, corpus });
  const recuperar = criarRecuperadorVetorial({ provider, store });
  return rodarEvalGeracao({ dataset, recuperar, llm: criarLLMSimulado({ comportamento }) });
}

describe('eval de geração — dataset ouro', () => {
  it('LLM fiel passa no gate (todas as perguntas respondidas citam; a sem evidência recusa)', async () => {
    const { resumo, perguntas } = await rodar('fiel');

    expect(verificarLimiares(resumo, MINIMOS_GERACAO, MAXIMOS_GERACAO)).toEqual({
      passou: true,
      falhas: [],
    });
    expect(perguntas.find(p => p.id === 'q5-sem-evidencia').recusou).toBe(true);
  });

  it('as perguntas respondíveis cobrem os fatos obrigatórios do dataset', async () => {
    const { perguntas } = await rodar('fiel');

    for (const p of perguntas.filter(x => x.cobertura_fatos !== null)) {
      expect({ id: p.id, cobertura: p.cobertura_fatos }).toEqual({ id: p.id, cobertura: 1 });
    }
  });

  it.each(['alucina', 'sem_citacao', 'acusatorio', 'malformado', 'sempre_recusa'])(
    'LLM %s reprova o gate',
    async comportamento => {
      const { resumo } = await rodar(comportamento);

      expect(verificarLimiares(resumo, MINIMOS_GERACAO, MAXIMOS_GERACAO).passou).toBe(false);
    }
  );
});
