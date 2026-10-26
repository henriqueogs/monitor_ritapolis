'use strict';

/**
 * Serviço perguntar() (ADR 0005): recupera → monta contexto delimitado → LLM → VERIFICA → entrega.
 * Nada que o modelo diga chega ao cidadão sem passar pelo verificador: resposta sem citação válida,
 * com valor em reais que não está nos documentos ou com linguagem acusatória vira recusa explícita.
 * Dependências injetadas (recuperador, LLMProvider, trace), sem acesso a banco ou rede aqui.
 */

const { avaliarFundamentacao } = require('../eval/metricas');
const { numerosInventados, termosAcusatorios } = require('../eval/metricas-geracao');
const { estimateTokensFromText } = require('../estimate-tokens');
const { RespostaNaoJsonError } = require('../ports/json-resposta');
const { mascararCpf } = require('./privacidade');
const { VERSAO_PROMPT } = require('../prompts/rag-resposta');
const {
  responderComContexto,
  RespostaForaDoContratoError,
  MENSAGEM_SEM_EVIDENCIA,
} = require('./resposta');

const MENSAGEM_NAO_FUNDAMENTADA =
  'Não consegui fundamentar uma resposta confiável nos documentos coletados. Consulte as fontes oficiais.';
const PERGUNTA_MIN = 3;
const PERGUNTA_MAX = 500;
const TEXTO_FILTRO_MAX = 50;
const K_PADRAO = 5;
const LIMIAR_EVIDENCIA_PADRAO = 0.2;
const TETO_CONTEXTO_PADRAO = 12000;
const FILTRO_LISTA_MAX = 20;
const RESPOSTA_MAX = 1500;
const CHAVES_FILTRO = ['ano', 'tipo', 'fonte'];
const MOTIVO_FORA_DO_CONTRATO = 'fora_do_contrato';
const MOTIVO_VALOR_INVENTADO = 'valor_inventado';
const MOTIVO_ACUSATORIA = 'linguagem_acusatoria';
const MOTIVO_LONGA_DEMAIS = 'resposta_longa_demais';

class PerguntaInvalidaError extends Error {
  constructor(motivo) {
    super(`Pergunta inválida: ${motivo}`);
    this.name = 'PerguntaInvalidaError';
  }
}

class OrcamentoEsgotadoError extends Error {
  constructor(limite) {
    super(`Limite diário de ${limite} perguntas atingido`);
    this.name = 'OrcamentoEsgotadoError';
    this.limite = limite;
  }
}

function validarPergunta(pergunta) {
  if (typeof pergunta !== 'string') {
    throw new PerguntaInvalidaError('texto esperado');
  }
  const texto = pergunta.trim();
  if (texto.length < PERGUNTA_MIN || texto.length > PERGUNTA_MAX) {
    throw new PerguntaInvalidaError(`entre ${PERGUNTA_MIN} e ${PERGUNTA_MAX} caracteres`);
  }
  return texto;
}

const valorFiltroValido = v =>
  Number.isInteger(v) || (typeof v === 'string' && v.trim() && v.length <= TEXTO_FILTRO_MAX);

function validarFiltros(filtros) {
  if (filtros === undefined || filtros === null) {
    return undefined;
  }
  if (typeof filtros !== 'object' || Array.isArray(filtros)) {
    throw new PerguntaInvalidaError('filtros deve ser um objeto');
  }
  for (const [chave, valor] of Object.entries(filtros)) {
    const lista = Array.isArray(valor) ? valor : [valor];
    const ano = chave === 'ano';
    if (!CHAVES_FILTRO.includes(chave)) {
      throw new PerguntaInvalidaError(`filtro desconhecido: ${chave}`);
    }
    if (
      !lista.length ||
      lista.length > FILTRO_LISTA_MAX ||
      !lista.every(v => valorFiltroValido(v) && (!ano || Number.isInteger(v)))
    ) {
      throw new PerguntaInvalidaError(`valor inválido para o filtro ${chave}`);
    }
  }
  return filtros;
}

function limitarContexto(recuperados, { limiar, teto }) {
  const contexto = [];
  let usado = 0;
  for (const r of recuperados.filter(x => x.score >= limiar)) {
    const restante = teto - usado;
    if (restante <= 0 || (contexto.length && r.texto.length > restante)) {
      break;
    }
    contexto.push({ ...r, texto: mascararCpf(r.texto).slice(0, restante) });
    usado += Math.min(r.texto.length, restante);
  }
  return contexto;
}

function criarOrcamentoDiario({ limite, agora }) {
  let dia = null;
  let usadas = 0;
  return () => {
    const hoje = agora().toISOString().slice(0, 10);
    if (hoje !== dia) {
      dia = hoje;
      usadas = 0;
    }
    if (usadas >= limite) {
      throw new OrcamentoEsgotadoError(limite);
    }
    usadas += 1;
  };
}

async function gerarResposta({ pergunta, contexto, llm }) {
  try {
    return await responderComContexto({ pergunta, contexto, llm });
  } catch (err) {
    if (err instanceof RespostaForaDoContratoError || err instanceof RespostaNaoJsonError) {
      return { malformada: true };
    }
    throw err;
  }
}

function verificarTexto(texto, contextoBase) {
  const motivos = [];
  if (texto.length > RESPOSTA_MAX) {
    motivos.push(MOTIVO_LONGA_DEMAIS);
  }
  if (numerosInventados(texto, contextoBase).length) {
    motivos.push(MOTIVO_VALOR_INVENTADO);
  }
  if (termosAcusatorios(texto).length) {
    motivos.push(MOTIVO_ACUSATORIA);
  }
  return motivos;
}

/**
 * Devolve { aprovada, motivos }. TODO texto que o modelo escreveu passa pelo verificador, inclusive
 * recusas. Valores precisam estar no documento CITADO (não em qualquer documento do contexto).
 */
function verificar(resposta, contexto) {
  if (resposta.malformada) {
    return { aprovada: false, motivos: [MOTIVO_FORA_DO_CONTRATO] };
  }
  if (resposta.recusou) {
    const motivos = verificarTexto(resposta.resposta, contexto);
    return { aprovada: motivos.length === 0, motivos };
  }
  const citados = new Set(resposta.citacoes.map(c => String(c.doc_id)));
  const contextoCitado = contexto.filter(c => citados.has(String(c.docId)));
  const motivos = [
    ...avaliarFundamentacao({ resposta, contexto }).motivos,
    ...verificarTexto(resposta.resposta, contextoCitado),
  ];
  return { aprovada: motivos.length === 0, motivos };
}

function montarEntrega(resposta, contexto) {
  const porDoc = new Map(contexto.map(c => [String(c.docId), c]));
  const citacoes = resposta.citacoes.map(c => ({
    doc_id: c.doc_id,
    trecho: mascararCpf(c.trecho),
    url_origem: c.url_origem,
    origemGenerica: Boolean(porDoc.get(String(c.doc_id))?.origemGenerica),
  }));
  const citados = [...new Set(citacoes.map(c => String(c.doc_id)))];
  const fontes = citados.map(id => ({
    docId: porDoc.get(id).docId,
    url_origem: porDoc.get(id).url_origem,
    origemGenerica: Boolean(porDoc.get(id).origemGenerica),
  }));
  return { recusou: false, resposta: mascararCpf(resposta.resposta), citacoes, fontes };
}

const recusa = mensagem => ({ recusou: true, resposta: mensagem, citacoes: [], fontes: [] });

function criarServicoPerguntar({
  recuperar,
  llm,
  registrarTrace = () => {},
  limiarEvidencia = LIMIAR_EVIDENCIA_PADRAO,
  k = K_PADRAO,
  tetoCaracteresContexto = TETO_CONTEXTO_PADRAO,
  limiteDiario = Infinity,
  agora = () => new Date(),
}) {
  const consumirOrcamento = criarOrcamentoDiario({ limite: limiteDiario, agora });

  async function perguntar({ pergunta, filtros } = {}) {
    const texto = validarPergunta(pergunta);
    const filtrosValidos = validarFiltros(filtros);
    consumirOrcamento();
    const inicio = Date.now();

    const recuperados = await recuperar(texto, { k, filtros: filtrosValidos });
    const contexto = limitarContexto(recuperados, {
      limiar: limiarEvidencia,
      teto: tetoCaracteresContexto,
    });
    const bruta = contexto.length
      ? await gerarResposta({ pergunta: texto, contexto, llm })
      : { recusou: true, resposta: MENSAGEM_SEM_EVIDENCIA, citacoes: [] };
    const { aprovada, motivos } = verificar(bruta, contexto);
    const entrega = aprovada
      ? bruta.recusou
        ? recusa(mascararCpf(bruta.resposta))
        : montarEntrega(bruta, contexto)
      : recusa(MENSAGEM_NAO_FUNDAMENTADA);

    registrarTrace({
      modelo: llm.model,
      prompt_versao: VERSAO_PROMPT,
      pergunta_tamanho: texto.length,
      recuperados: recuperados.length,
      usados: contexto.length,
      recusou: entrega.recusou,
      fundamentada: aprovada,
      motivos,
      latencia_ms: Date.now() - inicio,
      tokens_estimados: estimateTokensFromText(
        [texto, ...contexto.map(c => c.texto), bruta.resposta ?? ''].join(' ')
      ),
    });
    return { ...entrega, prompt_versao: VERSAO_PROMPT };
  }

  return { perguntar };
}

module.exports = {
  criarServicoPerguntar,
  PerguntaInvalidaError,
  OrcamentoEsgotadoError,
  MENSAGEM_NAO_FUNDAMENTADA,
};
