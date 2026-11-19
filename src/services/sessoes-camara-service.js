'use strict';

/**
 * Sessões da Câmara a partir das atas: extrai as pendentes com IA e revalida as já gravadas.
 * Publicação é direta (sem revisão humana); a barreira é a conferência contra o texto da ata.
 */

const logger = require('../logger');
const {
  SITUACAO,
  listarAtasComTexto,
  salvarSessao,
  getSessao,
  listarIdsDeSessoes,
} = require('../db/camara-sessoes-repo');
const { extrairSessaoDaAta, hashTexto } = require('../ai/extrair-sessao-ata');
const { VERSAO_EXTRATOR } = require('../ai/contracts/sessao-ata-contract');
const { STATUS_VALIDACAO, validarExtracaoSessao } = require('../camara/sessao-ata');

/** Pendente = nunca extraída, texto da ata mudou (novo OCR) ou a versão do extrator subiu. */
function precisaExtrair(ata) {
  return (
    ata.versao_extrator !== VERSAO_EXTRATOR || ata.texto_hash !== hashTexto(ata.texto_completo)
  );
}

async function extrairSessoesPendentes({
  limite = Infinity,
  forcar = false,
  extrair = extrairSessaoDaAta,
} = {}) {
  const pendentes = listarAtasComTexto().filter((ata) => forcar || precisaExtrair(ata));
  const resumo = { pendentes: pendentes.length, ok: 0, com_avisos: 0, invalida: 0, falhas: 0 };

  for (const ata of pendentes.slice(0, limite)) {
    try {
      const r = await extrair(ata);
      salvarSessao({
        documentoId: ata.id,
        sessao: r.sessao,
        avisos: r.avisos,
        status: r.status,
        modelo: r.modelo,
        textoHash: r.texto_hash,
        versaoExtrator: r.versao_extrator,
      });
      resumo[r.status] += 1;
      logger.info('sessao extraida da ata', {
        ata: ata.id,
        status: r.status,
        votacoes: r.sessao.votacoes.length,
        avisos: r.avisos.length,
      });
    } catch (err) {
      resumo.falhas += 1;
      logger.error('falha ao extrair sessao da ata', { ata: ata.id, erro: err.message });
    }
  }
  return resumo;
}

function comoExtracao(sessao) {
  return {
    data_sessao: sessao.data_sessao,
    presidente: sessao.presidente,
    presentes: sessao.presencas.filter((p) => p.situacao === SITUACAO.PRESENTE).map((p) => p.nome),
    ausentes: sessao.presencas
      .filter((p) => p.situacao !== SITUACAO.PRESENTE)
      .map((p) => ({ nome: p.nome, justificada: p.situacao === SITUACAO.AUSENTE_JUSTIFICADA })),
    votacoes: sessao.votacoes,
  };
}

/**
 * Confere de novo, sem IA, o que está gravado contra o texto atual de cada ata. O que deixou
 * de bater sai do ar; avisos antigos são mantidos (o item descartado não volta sozinho).
 */
function revalidarSessoes() {
  const textos = new Map(listarAtasComTexto().map((ata) => [ata.id, ata.texto_completo]));
  const resumo = { revalidadas: 0, alteradas: 0 };

  for (const id of listarIdsDeSessoes()) {
    const gravada = getSessao(id);
    const r = validarExtracaoSessao(comoExtracao(gravada), textos.get(id) || '');
    const avisos = [...new Set([...gravada.avisos, ...r.avisos])];
    let status = avisos.length ? STATUS_VALIDACAO.COM_AVISOS : STATUS_VALIDACAO.OK;
    if (r.status === STATUS_VALIDACAO.INVALIDA) {
      status = STATUS_VALIDACAO.INVALIDA;
    }
    resumo.revalidadas += 1;
    if (r.avisos.length === 0 && status === gravada.status_validacao) {
      continue;
    }
    salvarSessao({
      documentoId: id,
      sessao: r.sessao,
      avisos,
      status,
      modelo: gravada.modelo,
      textoHash: gravada.texto_hash,
      versaoExtrator: gravada.versao_extrator,
    });
    resumo.alteradas += 1;
  }
  return resumo;
}

module.exports = { precisaExtrair, extrairSessoesPendentes, revalidarSessoes };
