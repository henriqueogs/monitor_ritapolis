'use strict';

/**
 * Recuperador híbrido (ADR 0003): ramo vetorial + ramo lexical (BM25) em paralelo, fundidos por RRF.
 * O `score` de cada resultado continua sendo o cosseno com a pergunta (mesmo sinal de evidência do
 * recuperador vetorial, usado pelo limiar do eval); a ordem vem do RRF (`scoreRrf`, `ramos`).
 * Store sem `searchLexical` degrada para vetor puro.
 *
 * Identificador de documento na pergunta ("Decreto nº 3/2025"): o RRF sozinho derruba o chunk que
 * cita o número exato quando só o ramo lexical o acha (os vizinhos "decreto/2025" aparecem nos dois
 * ramos e somam mais). Quem pergunta por um número quer o documento daquele número, então os chunks
 * cujo texto cita o identificador (tokens adjacentes, com variantes de zeros) vão para o topo, na
 * ordem do RRF entre si, e o resto segue depois. Entre os promovidos, quem casa mais termos da
 * pergunta ("decreto" em "Decreto nº 3/2025") sobe: processos de outro tipo com o mesmo número
 * (003/2025) não podem tirar o decreto do top-k. Empate preserva a ordem do RRF.
 */

const { TIPOS_EMBEDDING } = require('../ports/embedding-provider');
const { fundirRRF } = require('./rrf');
const {
  identificadoresDocumento,
  tokensBrutos,
  contemSequencia,
  tokenizar,
} = require('../vector/lexical');

const K_PADRAO = 10;
const FATOR_CANDIDATOS_PADRAO = 5;

function criarRecuperadorHibrido({ provider, store, fatorCandidatos = FATOR_CANDIDATOS_PADRAO }) {
  return async (pergunta, { k = K_PADRAO, filtros } = {}) => {
    const [vetor] = await provider.embed([pergunta], { tipo: TIPOS_EMBEDDING.QUERY });
    const candidatos = k * fatorCandidatos;
    const [porVetor, porTexto] = await Promise.all([
      store.search({ vetor, k: candidatos, filtros }),
      typeof store.searchLexical === 'function'
        ? store.searchLexical({ consulta: pergunta, vetor, k: candidatos, filtros })
        : [],
    ]);
    const fundidos = fundirRRF([
      { nome: 'vetor', itens: porVetor },
      { nome: 'lexical', itens: porTexto },
    ]);
    return promoverIdentificador(fundidos, pergunta).slice(0, k);
  };
}

/** Chunks que citam o identificador (N/AAAA) da pergunta primeiro; demais na ordem original. */
function promoverIdentificador(fundidos, pergunta) {
  const identificadores = identificadoresDocumento(pergunta);
  if (!identificadores.length) {
    return fundidos;
  }
  const termos = tokenizar(pergunta);
  const promovidos = [];
  const demais = [];
  for (const item of fundidos) {
    const tokens = tokensBrutos(item.texto);
    if (identificadores.some(sequencia => contemSequencia(tokens, sequencia))) {
      promovidos.push({ item, casados: contarCasados(termos, tokens) });
    } else {
      demais.push(item);
    }
  }
  promovidos.sort((a, b) => b.casados - a.casados); // sort é estável: empate mantém o RRF
  return [...promovidos.map(p => p.item), ...demais];
}

function contarCasados(termos, tokens) {
  const presentes = new Set(tokens);
  return termos.filter(termo => presentes.has(termo)).length;
}

module.exports = { criarRecuperadorHibrido };
