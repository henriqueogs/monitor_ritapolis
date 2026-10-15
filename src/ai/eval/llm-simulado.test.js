'use strict';

const { criarLLMSimulado } = require('./llm-simulado');
const { montarPromptResposta } = require('../prompts/rag-resposta');
const { assertLLMProvider } = require('../ports/llm-provider');

const contexto = [
  {
    docId: 1,
    texto: 'A empresa Alimentos Minas Ltda foi declarada vencedora do pregão eletrônico.',
    url_origem: 'https://x/1',
  },
];
const prompt = montarPromptResposta({ pergunta: 'Quem venceu?', contexto });

describe('criarLLMSimulado', () => {
  it('cumpre a porta LLMProvider', () => {
    expect(() => assertLLMProvider(criarLLMSimulado({ comportamento: 'fiel' }))).not.toThrow();
  });

  it('fiel: responde com trecho e url_origem copiados do primeiro documento do prompt', async () => {
    const r = await criarLLMSimulado({ comportamento: 'fiel' }).generateJson({ prompt });

    expect(r.recusou).toBe(false);
    expect(r.citacoes[0]).toMatchObject({ doc_id: 1, url_origem: 'https://x/1' });
    expect(contexto[0].texto).toContain(r.citacoes[0].trecho);
    expect(r.resposta).toContain('Alimentos Minas');
  });

  it('fiel: sem documentos no prompt, recusa', async () => {
    const vazio = montarPromptResposta({ pergunta: 'q?', contexto: [] });

    const r = await criarLLMSimulado({ comportamento: 'fiel' }).generateJson({ prompt: vazio });

    expect(r).toMatchObject({ recusou: true, citacoes: [] });
  });

  it.each([
    ['alucina', r => expect(r.citacoes[0].doc_id).toBe(999)],
    ['sem_citacao', r => expect(r.citacoes).toEqual([])],
    ['sempre_recusa', r => expect(r.recusou).toBe(true)],
    ['acusatorio', r => expect(r.resposta).toMatch(/fraude/i)],
    ['malformado', r => expect(r.recusou).toBeUndefined()],
  ])('comportamento %s', async (comportamento, verificar) => {
    verificar(await criarLLMSimulado({ comportamento }).generateJson({ prompt }));
  });

  it('comportamento desconhecido falha na criação', () => {
    expect(() => criarLLMSimulado({ comportamento: 'banana' })).toThrow(/comportamento/i);
  });
});
