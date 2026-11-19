'use strict';

/**
 * Confere contra o texto da ata o que a IA extraiu de uma sessão (presença e votações).
 *
 * A extração é publicada sem revisão humana, então só passa o que o próprio texto sustenta:
 * - presença/ausência: nome na abertura da ata (onde a Câmara lista os vereadores) ou numa
 *   frase de posse de suplente. Nome citado em outro ponto (assessor, convidado, cidadão)
 *   não vira vereador presente;
 * - data: o mês tem de constar na abertura;
 * - votação: trecho literal da ata;
 * - voto nominal: a pessoa é citada no trecho e a palavra de voto mais próxima antes do nome
 *   (a favor / contra / abstenção) confere com o voto atribuído.
 * Avisos públicos não repetem nomes descartados: o nome que a ata não sustenta não é exposto.
 * A mesma conferência serve de revalidação (texto novo de OCR ou regra nova).
 */

const { ANO_PLAUSIVEL_MIN } = require('../utils/mandato');

const STATUS_VALIDACAO = { OK: 'ok', COM_AVISOS: 'com_avisos', INVALIDA: 'invalida' };
const TRECHO_MINIMO = 20;
const ABERTURA_PADRAO = 1500;
const RE_CARGO = /^\s*((vice-?\s*)?presidente|vereador(a)?|secret[áa]ri[oa]|senhor(a)?|sr\.?|sra\.?)\s+/i;
const MARCAS_FIM_ABERTURA = [' deu se inicio ', ' declarou em nome de deus aberta ', ' aberta a sessao '];
const RE_POSSE = / (posse|empossad\w*|suplente) /;
const MESES = [
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
const PALAVRAS_DE_VOTO = [
  { voto: 'favoravel', re: / (favoravel|favoraveis|a favor) /g },
  { voto: 'contrario', re: / (contrario|contrarios|contra) /g },
  { voto: 'abstencao', re: / (abstencao|abstencoes|absteve|abstiveram|abstevese) /g },
];

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const comEspacos = (texto) => ` ${normalizar(texto)} `;

function contemTrecho(texto, trecho) {
  const alvo = normalizar(trecho);
  return alvo.length >= TRECHO_MINIMO && normalizar(texto).includes(alvo);
}

/** Abertura da ata: até "deu-se início" (ou equivalente); sem marca, o começo do texto. */
function aberturaDaAta(texto) {
  const norm = comEspacos(texto);
  const posicoes = MARCAS_FIM_ABERTURA.map((m) => norm.indexOf(m)).filter((i) => i > 0);
  // +1 mantém o espaço antes da marca: o último nome da lista ainda casa com " nome ".
  const fim = posicoes.length ? Math.min(...posicoes) + 1 : ABERTURA_PADRAO;
  return norm.slice(0, fim);
}

/** Frases em que um suplente é empossado (presente apesar de fora da lista de abertura). */
function frasesDePosse(texto) {
  return String(texto || '')
    .split(/[.;]\s/)
    .map(comEspacos)
    .filter((frase) => RE_POSSE.test(frase));
}

function citadoNaAbertura(nome, { abertura, posses }) {
  const alvo = comEspacos(nome);
  return alvo.trim().length > 0 && (abertura.includes(alvo) || posses.some((f) => f.includes(alvo)));
}

/** Forma curta usada na ata ("Júlio Cezar") → nome completo de um presente; null se ambíguo. */
function resolverNome(mencao, nomes) {
  const alvo = comEspacos(mencao);
  if (!alvo.trim()) {
    return null;
  }
  const candidatos = nomes.filter((nome) => comEspacos(nome).includes(alvo));
  return candidatos.length === 1 ? candidatos[0] : null;
}

function filtrarPorAbertura(itens, nomeDe, contexto, { avisos, rotulo }) {
  const unicos = [...new Map(itens.map((item) => [normalizar(nomeDe(item)), item])).values()];
  const aceitos = unicos.filter((item) => citadoNaAbertura(nomeDe(item), contexto));
  const descartados = unicos.length - aceitos.length;
  if (descartados > 0) {
    avisos.push(`${descartados} ${rotulo} descartada(s): nome fora da abertura da ata`);
  }
  return aceitos;
}

function conferirData(dataSessao, abertura, { avisos, hoje }) {
  if (!dataSessao) {
    return null;
  }
  const [ano, mes] = dataSessao.split('-').map(Number);
  const mesNaAbertura = MESES[mes - 1] && abertura.includes(` ${MESES[mes - 1]} `);
  const numerica = abertura.includes(` ${Number(dataSessao.slice(8, 10))} ${mes} ${ano} `);
  const plausivel = ano >= ANO_PLAUSIVEL_MIN && dataSessao <= hoje;
  if (plausivel && (mesNaAbertura || numerica)) {
    return dataSessao;
  }
  avisos.push('data da sessão descartada: não confere com a abertura da ata');
  return null;
}

const semCargo = (mencao) => String(mencao || '').replace(RE_CARGO, '');

/**
 * Posição, no trecho normalizado, da menor forma do nome que não se confunde com outro
 * presente ("Edir" basta para Edir Bonifácio; "Paula" não, se também há Anna Paula). -1 se
 * a pessoa não é citada.
 */
function posicaoNoTrecho(nomeCompleto, trechoNorm, presentes) {
  const palavras = normalizar(nomeCompleto).split(' ');
  const outros = presentes.filter((p) => p !== nomeCompleto).map(comEspacos);
  for (let n = 1; n <= palavras.length; n += 1) {
    const forma = ` ${palavras.slice(0, n).join(' ')} `;
    if (!outros.some((outro) => outro.includes(forma))) {
      return trechoNorm.indexOf(forma);
    }
  }
  return -1;
}

/** Voto indicado pela palavra de voto mais próxima antes do nome (ou, sem ela, depois). */
function votoPelaPosicao(trechoNorm, posicao) {
  const marcas = PALAVRAS_DE_VOTO.flatMap(({ voto, re }) =>
    [...trechoNorm.matchAll(re)].map((m) => ({ voto, indice: m.index }))
  );
  const antes = marcas.filter((m) => m.indice < posicao).sort((a, b) => b.indice - a.indice);
  const depois = marcas.filter((m) => m.indice > posicao).sort((a, b) => a.indice - b.indice);
  return (antes[0] || depois[0])?.voto ?? null;
}

function conferirNominais(votacao, presentes, avisos) {
  const trechoNorm = comEspacos(votacao.trecho);
  const nominais = [];
  let foraDoTrecho = 0;
  let direcaoErrada = 0;
  for (const { nome, voto } of votacao.nominais || []) {
    const completo = resolverNome(semCargo(nome), presentes);
    const posicao = completo ? posicaoNoTrecho(completo, trechoNorm, presentes) : -1;
    if (posicao < 0) {
      foraDoTrecho += 1;
    } else if (votoPelaPosicao(trechoNorm, posicao) !== voto) {
      direcaoErrada += 1;
    } else {
      nominais.push({ nome: completo, voto });
    }
  }
  if (foraDoTrecho) {
    avisos.push(`${votacao.materia}: ${foraDoTrecho} voto(s) nominal(is) descartado(s), pessoa fora do trecho ou sem presença única`);
  }
  if (direcaoErrada) {
    avisos.push(`${votacao.materia}: ${direcaoErrada} voto(s) nominal(is) descartado(s), direção do voto não confere com o trecho`);
  }
  return nominais;
}

/**
 * Mais nomes do que o placar de um lado indica votação com mais de uma opção (ex.: a favor
 * com emendas e a favor na íntegra). Sem como dizer quem votou em quê, os nomes saem e
 * ficam só o placar e o trecho.
 */
function placarComportaNominais(votacao, nominais, avisos) {
  const pares = [
    ['favoravel', votacao.votos_favoraveis],
    ['contrario', votacao.votos_contrarios],
    ['abstencao', votacao.abstencoes],
  ];
  for (const [voto, total] of pares) {
    const nominaisDoTipo = nominais.filter((n) => n.voto === voto).length;
    if (Number.isInteger(total) && nominaisDoTipo > total) {
      avisos.push(
        `${votacao.materia}: nomes omitidos, ${nominaisDoTipo} votos nominais acima do placar (${total})`
      );
      return false;
    }
  }
  return true;
}

function conferirVotacoes(extracao, texto, presentes, avisos) {
  const votacoes = [];
  for (const votacao of extracao.votacoes || []) {
    if (!contemTrecho(texto, votacao.trecho)) {
      avisos.push(`${votacao.materia}: votação descartada, trecho não encontrado na ata`);
      continue;
    }
    const nominais = conferirNominais(votacao, presentes, avisos);
    const cabem = placarComportaNominais(votacao, nominais, avisos);
    votacoes.push({ ...votacao, nominais: cabem ? nominais : [] });
  }
  return votacoes;
}

/**
 * @param {{hoje?: string}} [opcoes] data de referência (AAAA-MM-DD) para recusar data futura
 * @returns {{sessao: object, avisos: string[], status: 'ok'|'com_avisos'|'invalida'}}
 */
function validarExtracaoSessao(extracao, textoAta, { hoje = new Date().toISOString().slice(0, 10) } = {}) {
  const avisos = [];
  const contexto = { abertura: aberturaDaAta(textoAta), posses: frasesDePosse(textoAta) };
  const nomes = [extracao.presidente, ...(extracao.presentes || [])].filter(Boolean);
  const presentes = filtrarPorAbertura(nomes, (n) => n, contexto, { avisos, rotulo: 'presença' });
  const ausentes = filtrarPorAbertura(extracao.ausentes || [], (a) => a.nome, contexto, {
    avisos,
    rotulo: 'ausência',
  });
  const dataSessao = conferirData(extracao.data_sessao, contexto.abertura, { avisos, hoje });
  const votacoes = conferirVotacoes(extracao, textoAta, presentes, avisos);
  const presidente = presentes.find((nome) => normalizar(nome) === normalizar(extracao.presidente));

  let status = avisos.length ? STATUS_VALIDACAO.COM_AVISOS : STATUS_VALIDACAO.OK;
  if (presentes.length === 0) {
    status = STATUS_VALIDACAO.INVALIDA;
  }
  return {
    sessao: { data_sessao: dataSessao, presidente: presidente || null, presentes, ausentes, votacoes },
    avisos,
    status,
  };
}

module.exports = {
  STATUS_VALIDACAO,
  normalizar,
  contemTrecho,
  resolverNome,
  validarExtracaoSessao,
};
