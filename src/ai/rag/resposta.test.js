'use strict';

const {
  normalizarRespostaRag,
  responderComContexto,
  RespostaForaDoContratoError,
  MENSAGEM_SEM_EVIDENCIA,
} = require('./resposta');
const { VERSAO_PROMPT } = require('../prompts/rag-resposta');
const { criarFakeLLMProvider } = require('../adapters/fake-llm-provider');

const contexto = [
  { docId: 1, texto: 'A empresa Alimentos Minas venceu o pregão.', url_origem: 'https://x/1' },
];
const valida = {
  recusou: false,
  resposta: 'Alimentos Minas.',
  citacoes: [{ doc_id: 1, trecho: 'Alimentos Minas venceu', url_origem: 'https://x/1' }],
};

describe('normalizarRespostaRag', () => {
  it('aceita o contrato e mantém só os campos conhecidos da citação', () => {
    const r = normalizarRespostaRag({
      ...valida,
      citacoes: [{ ...valida.citacoes[0], extra: 'descartado' }],
      lixo: true,
    });

    expect(r).toEqual(valida);
  });

  it('citacoes ausente vira lista vazia', () => {
    expect(normalizarRespostaRag({ recusou: true, resposta: 'Não encontrei.' }).citacoes).toEqual(
      []
    );
  });

  it.each([
    [null],
    ['texto'],
    [{}],
    [{ recusou: 'sim', resposta: 'x' }],
    [{ recusou: false, resposta: '' }],
    [{ recusou: false, resposta: 'x', citacoes: 'nenhuma' }],
    [{ recusou: false, resposta: 'x', citacoes: ['solta'] }],
    [{ recusou: false, resposta: 'x', citacoes: [{ doc_id: 1 }] }],
  ])('fora do contrato (%j) → RespostaForaDoContratoError', entrada => {
    expect(() => normalizarRespostaRag(entrada)).toThrow(RespostaForaDoContratoError);
  });
});

describe('responderComContexto', () => {
  it('monta o prompt versionado, chama o LLM com temperatura 0 e devolve a resposta normalizada', async () => {
    const llm = criarFakeLLMProvider({ resposta: valida });
    const espiao = jest.spyOn(llm, 'generateJson');

    const r = await responderComContexto({ pergunta: 'Quem venceu?', contexto, llm });

    expect(espiao).toHaveBeenCalledTimes(1);
    const [opcoes] = espiao.mock.calls[0];
    expect(opcoes.temperature).toBe(0);
    expect(opcoes.prompt).toContain('Quem venceu?');
    expect(opcoes.prompt).toContain('https://x/1');
    expect(r).toMatchObject({ ...valida, prompt_versao: VERSAO_PROMPT });
  });

  it('sem contexto recusa SEM chamar o LLM (sem evidência → recusa, ADR 0005)', async () => {
    const llm = criarFakeLLMProvider({ resposta: valida });
    const espiao = jest.spyOn(llm, 'generateJson');

    const r = await responderComContexto({ pergunta: 'q?', contexto: [], llm });

    expect(espiao).not.toHaveBeenCalled();
    expect(r).toMatchObject({ recusou: true, resposta: MENSAGEM_SEM_EVIDENCIA, citacoes: [] });
  });

  it('resposta fora do contrato rejeita com RespostaForaDoContratoError', async () => {
    const llm = criarFakeLLMProvider({ resposta: { oops: true } });

    await expect(responderComContexto({ pergunta: 'q?', contexto, llm })).rejects.toBeInstanceOf(
      RespostaForaDoContratoError
    );
  });

  it('falha do provedor propaga (não vira recusa silenciosa)', async () => {
    const llm = criarFakeLLMProvider({ falha: new Error('429') });

    await expect(responderComContexto({ pergunta: 'q?', contexto, llm })).rejects.toThrow('429');
  });

  it('exige um LLMProvider válido', async () => {
    await expect(responderComContexto({ pergunta: 'q?', contexto, llm: {} })).rejects.toThrow(
      TypeError
    );
  });
});
