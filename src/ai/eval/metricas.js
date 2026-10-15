'use strict';

/** Métricas puras do eval (ADR 0006): recuperação, citações válidas (§11.3 / ADR 0005) e recusa. */

const TRECHO_MINIMO_CHARS = 10; // "de" ou "" estariam contidos em qualquer texto

const MOTIVOS = Object.freeze({
  DOC_FORA: 'doc_fora_do_contexto',
  TRECHO_CURTO: 'trecho_curto_demais',
  TRECHO: 'trecho_nao_encontrado',
  URL_AUSENTE: 'sem_url_origem',
  URL_DIFERENTE: 'url_diferente_do_contexto',
  SEM_CITACAO: 'sem_citacao',
});

const normalizarTexto = t =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Fração das fontes esperadas presentes no top-k. null quando não há fonte esperada. */
function recallAtK(esperados, recuperados, k) {
  if (!esperados.length) {
    return null;
  }
  const topo = recuperados.slice(0, k);
  return esperados.filter(e => topo.includes(e)).length / esperados.length;
}

function reciprocalRank(esperados, recuperados) {
  const posicao = recuperados.findIndex(r => esperados.includes(r));
  return posicao === -1 ? 0 : 1 / (posicao + 1);
}

function media(valores) {
  const numeros = valores.filter(v => typeof v === 'number');
  return numeros.length ? numeros.reduce((a, b) => a + b, 0) / numeros.length : null;
}

/** Motivo pelo qual a citação não se sustenta no contexto recuperado, ou null se for válida. */
function motivoInvalido(citacao, contexto) {
  const chunks = contexto.filter(c => String(c.docId) === String(citacao.doc_id));
  if (!chunks.length) {
    return MOTIVOS.DOC_FORA;
  }
  const trecho = normalizarTexto(citacao.trecho);
  if (trecho.length < TRECHO_MINIMO_CHARS) {
    return MOTIVOS.TRECHO_CURTO;
  }
  if (!chunks.some(c => normalizarTexto(c.texto).includes(trecho))) {
    return MOTIVOS.TRECHO;
  }
  if (!citacao.url_origem) {
    return MOTIVOS.URL_AUSENTE;
  }
  if (!chunks.some(c => c.url_origem === citacao.url_origem)) {
    return MOTIVOS.URL_DIFERENTE;
  }
  return null;
}

/**
 * Cada citação precisa apontar um documento do contexto, trazer um trecho substancial presente em
 * algum chunk dele e repetir a url_origem do contexto (não basta existir: tem de ser a mesma).
 */
function citacoesValidas({ citacoes = [], contexto }) {
  const invalidas = [];
  for (const citacao of citacoes) {
    const motivo = motivoInvalido(citacao, contexto);
    if (motivo) {
      invalidas.push({ ...citacao, motivo });
    }
  }
  return { validas: citacoes.length - invalidas.length, total: citacoes.length, invalidas };
}

/** ADR 0005: ou recusa, ou responde citando — resposta sem citação válida reprova. */
function avaliarFundamentacao({ resposta, contexto }) {
  if (resposta?.recusou) {
    return { ok: true, validas: 0, total: 0, motivos: [] };
  }
  const citacoes = resposta?.citacoes ?? [];
  if (!citacoes.length) {
    return { ok: false, validas: 0, total: 0, motivos: [MOTIVOS.SEM_CITACAO] };
  }
  const r = citacoesValidas({ citacoes, contexto });
  return {
    ok: r.invalidas.length === 0,
    validas: r.validas,
    total: r.total,
    motivos: r.invalidas.map(i => i.motivo),
  };
}

function recusaCorreta(resposta, deveRecusar) {
  return Boolean(resposta?.recusou) === Boolean(deveRecusar);
}

module.exports = {
  recallAtK,
  reciprocalRank,
  media,
  citacoesValidas,
  avaliarFundamentacao,
  recusaCorreta,
  MOTIVOS,
};
