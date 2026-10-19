'use strict';

/**
 * Núcleo da resposta com recuperação: monta o prompt versionado, chama o LLMProvider injetado e
 * normaliza a saída para o contrato { recusou, resposta, citacoes }. Sem evidência não há chamada:
 * recusa direta (ADR 0005). Quem recupera o contexto e quem verifica a fundamentação ficam de fora.
 */

const { assertLLMProvider } = require('../ports/llm-provider');
const { montarPromptResposta, VERSAO_PROMPT } = require('../prompts/rag-resposta');

const MENSAGEM_SEM_EVIDENCIA =
  'Não encontrei nos documentos coletados evidência suficiente para responder a esta pergunta.';

class RespostaForaDoContratoError extends Error {
  constructor(motivo) {
    super(`Resposta do modelo fora do contrato: ${motivo}`);
    this.name = 'RespostaForaDoContratoError';
  }
}

const ehObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const ehTexto = v => typeof v === 'string';

function normalizarCitacao(citacao, indice) {
  if (!ehObjeto(citacao)) {
    throw new RespostaForaDoContratoError(`citação ${indice} não é um objeto`);
  }
  if (citacao.doc_id === undefined || citacao.doc_id === null) {
    throw new RespostaForaDoContratoError(`citação ${indice} sem doc_id`);
  }
  if (!ehTexto(citacao.trecho)) {
    throw new RespostaForaDoContratoError(`citação ${indice} sem trecho`);
  }
  return {
    doc_id: citacao.doc_id,
    trecho: citacao.trecho,
    url_origem: ehTexto(citacao.url_origem) ? citacao.url_origem : '',
  };
}

function normalizarRespostaRag(bruta) {
  if (!ehObjeto(bruta)) {
    throw new RespostaForaDoContratoError('não é um objeto');
  }
  if (typeof bruta.recusou !== 'boolean') {
    throw new RespostaForaDoContratoError('"recusou" deve ser booleano');
  }
  if (!ehTexto(bruta.resposta) || !bruta.resposta.trim()) {
    throw new RespostaForaDoContratoError('"resposta" deve ser texto não vazio');
  }
  if (bruta.citacoes !== undefined && !Array.isArray(bruta.citacoes)) {
    throw new RespostaForaDoContratoError('"citacoes" deve ser lista');
  }
  return {
    recusou: bruta.recusou,
    resposta: bruta.resposta,
    citacoes: (bruta.citacoes ?? []).map(normalizarCitacao),
  };
}

/**
 * @param {{ pergunta: string, contexto: { docId, texto, url_origem }[], llm: object }} entrada
 */
async function responderComContexto({ pergunta, contexto, llm }) {
  assertLLMProvider(llm);
  if (!contexto.length) {
    return {
      recusou: true,
      resposta: MENSAGEM_SEM_EVIDENCIA,
      citacoes: [],
      prompt_versao: VERSAO_PROMPT,
    };
  }
  const bruta = await llm.generateJson({
    prompt: montarPromptResposta({ pergunta, contexto }),
    temperature: 0,
  });
  return { ...normalizarRespostaRag(bruta), prompt_versao: VERSAO_PROMPT };
}

module.exports = {
  responderComContexto,
  normalizarRespostaRag,
  RespostaForaDoContratoError,
  MENSAGEM_SEM_EVIDENCIA,
};
