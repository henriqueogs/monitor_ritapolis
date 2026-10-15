'use strict';

/**
 * LLMProvider simulado para o eval offline: lê os documentos do próprio prompt (formato de
 * prompts/rag-resposta.js) e responde com um comportamento fixo. Serve para provar que o runner
 * e o gate distinguem um modelo fiel de modelos que alucinam, omitem citação, acusam ou saem do contrato.
 */

const { lerContextoDoPrompt } = require('../prompts/rag-resposta');
const { MENSAGEM_SEM_EVIDENCIA } = require('../rag/resposta');

const TAMANHO_RESPOSTA = 200;
const TAMANHO_TRECHO = 80;
const DOC_INVENTADO = 999;

const recusa = () => ({ recusou: true, resposta: MENSAGEM_SEM_EVIDENCIA, citacoes: [] });

function fiel(prompt, complemento = '') {
  const [doc] = lerContextoDoPrompt(prompt);
  if (!doc) {
    return recusa();
  }
  return {
    recusou: false,
    resposta: `Segundo o documento ${doc.docId}: ${doc.texto.slice(0, TAMANHO_RESPOSTA)}${complemento}`,
    citacoes: [
      { doc_id: doc.docId, trecho: doc.texto.slice(0, TAMANHO_TRECHO), url_origem: doc.url_origem },
    ],
  };
}

const COMPORTAMENTOS = {
  fiel: prompt => fiel(prompt),
  acusatorio: prompt => fiel(prompt, ' Há indício de fraude neste contrato.'),
  alucina: () => ({
    recusou: false,
    resposta: 'A empresa Exemplo recebeu R$ 9.999.999,00 no contrato.',
    citacoes: [
      {
        doc_id: DOC_INVENTADO,
        trecho: 'trecho inventado sobre o contrato',
        url_origem: 'https://inventada.example/999',
      },
    ],
  }),
  sem_citacao: () => ({
    recusou: false,
    resposta: 'A empresa Exemplo venceu o pregão.',
    citacoes: [],
  }),
  sempre_recusa: () => ({ recusou: true, resposta: 'Não sei responder.', citacoes: [] }),
  malformado: () => ({ oops: true }),
};

function criarLLMSimulado({ comportamento = 'fiel' } = {}) {
  const gerar = COMPORTAMENTOS[comportamento];
  if (!gerar) {
    throw new Error(
      `comportamento desconhecido: ${comportamento} (use ${Object.keys(COMPORTAMENTOS).join(', ')})`
    );
  }
  return {
    provider: 'simulado',
    model: 'llm-simulado',
    async generateJson({ prompt }) {
      return gerar(prompt);
    },
  };
}

module.exports = { criarLLMSimulado, COMPORTAMENTOS };
