'use strict';

/**
 * Lê cadastro, proposições e sessões da Câmara e entrega o roster, o perfil de cada
 * parlamentar (o que pediu, frequência, votos nominais) e as votações de cada projeto.
 */

const {
  listarVereadoresComMandatos,
  listarProposicoesComAutor,
  listarProjetosComAutor,
} = require('../db/parlamentares-repo');
const {
  listarPresencas,
  listarVotosNominais,
  listarVotacoes,
} = require('../db/camara-sessoes-repo');
const { getProjetoDossie } = require('../db/camara-repo');
const { listarCandidaturasTse } = require('../db/candidaturas-tse-repo');
const { montarRoster, montarPerfil, slugParlamentar } = require('../camara/parlamentares');
const { calcularFrequencia, votacoesDoProjeto } = require('../camara/frequencia');

function lerBase(presencas) {
  return {
    vereadores: listarVereadoresComMandatos(),
    proposicoes: listarProposicoesComAutor(),
    nomesDeSessoes: presencas.map((p) => p.nome),
    candidaturas: listarCandidaturasTse(),
  };
}

function listarParlamentares() {
  return montarRoster(lerBase(listarPresencas()));
}

function getPerfilParlamentar(id) {
  const presencas = listarPresencas();
  const perfil = montarPerfil(id, { ...lerBase(presencas), projetos: listarProjetosComAutor() });
  if (!perfil) {
    return null;
  }
  const slugs = [perfil.slug, ...perfil.aliases];
  return {
    ...perfil,
    frequencia: calcularFrequencia(slugs, presencas),
    votos: listarVotosNominais().filter((voto) => slugs.includes(slugParlamentar(voto.nome))),
  };
}

/** Projeto em tramitação com as votações em que ele aparece nas atas. */
function getProjetoComVotacoes(intPrjt) {
  const projeto = getProjetoDossie(intPrjt);
  if (!projeto) {
    return null;
  }
  return { ...projeto, votacoes: votacoesDoProjeto(projeto, listarVotacoes()) };
}

module.exports = { listarParlamentares, getPerfilParlamentar, getProjetoComVotacoes };
