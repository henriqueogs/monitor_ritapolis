'use strict';

/** Métricas puras do eval (ADR 0006): recuperação, citações válidas (§11.3) e recusa. */

const MOTIVOS = Object.freeze({
  DOC_FORA: 'doc_fora_do_contexto',
  TRECHO: 'trecho_nao_encontrado',
  URL: 'sem_url_origem',
});

const normalizarTexto = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Fração das fontes esperadas presentes no top-k. null quando não há fonte esperada. */
function recallAtK(esperados, recuperados, k) {
  if (!esperados.length) {return null;}
  const topo = recuperados.slice(0, k);
  return esperados.filter((e) => topo.includes(e)).length / esperados.length;
}

function reciprocalRank(esperados, recuperados) {
  const posicao = recuperados.findIndex((r) => esperados.includes(r));
  return posicao === -1 ? 0 : 1 / (posicao + 1);
}

function media(valores) {
  const numeros = valores.filter((v) => typeof v === 'number');
  return numeros.length ? numeros.reduce((a, b) => a + b, 0) / numeros.length : null;
}

function motivoInvalido(citacao, contexto) {
  const doc = contexto.find((c) => c.docId === citacao.doc_id);
  if (!doc) {return MOTIVOS.DOC_FORA;}
  if (!normalizarTexto(doc.texto).includes(normalizarTexto(citacao.trecho))) {return MOTIVOS.TRECHO;}
  if (!citacao.url_origem) {return MOTIVOS.URL;}
  return null;
}

/** Cada citação precisa apontar documento do contexto, trecho presente nele e url_origem (§11.3). */
function citacoesValidas({ citacoes, contexto }) {
  const invalidas = [];
  for (const citacao of citacoes) {
    const motivo = motivoInvalido(citacao, contexto);
    if (motivo) {invalidas.push({ ...citacao, motivo });}
  }
  return { validas: citacoes.length - invalidas.length, total: citacoes.length, invalidas };
}

function recusaCorreta(resposta, deveRecusar) {
  return Boolean(resposta?.recusou) === Boolean(deveRecusar);
}

module.exports = { recallAtK, reciprocalRank, media, citacoesValidas, recusaCorreta, MOTIVOS };
