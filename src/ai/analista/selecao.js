'use strict';

/**
 * Quais credores o Analista IA deve ver, e como tratar dado pessoal no texto do dossiê. Puro.
 * Fora: pessoa física, folha, previdência, tributos, concessionárias e repasses (já definidos em
 * limites-dispensa) e entidades (associações, fundações, consórcios, sindicatos), cujo gasto é
 * repasse e não compra. CPF que aparece dentro de nome de MEI ou de histórico é mascarado.
 */

const { motivoExclusao } = require('../../alertas/limites-dispensa');

const MOTIVO_ENTIDADE = 'entidade';
const MOTIVO_PF = 'pessoa_fisica';

const normalizar = texto =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const ENTIDADE =
  /^(ass\.?|assoc\w*|fundacao|consorcio|sindicato|camara municipal|prefeitura|municipio)(\s|$)/;
const CPF = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/g;

function motivoNaoAnalisavel({ nome, cnpj }) {
  const motivo = motivoExclusao({ credor_documento: cnpj, historico: nome });
  if (motivo) {
    return motivo === 'pessoa_fisica' ? MOTIVO_PF : motivo;
  }
  return ENTIDADE.test(normalizar(nome).trim()) ? MOTIVO_ENTIDADE : null;
}

function mascararCpf(texto) {
  return String(texto ?? '').replace(CPF, '***');
}

function filtrarAnalisaveis(credores, limite) {
  return credores.filter(c => !motivoNaoAnalisavel(c)).slice(0, limite);
}

module.exports = { motivoNaoAnalisavel, mascararCpf, filtrarAnalisaveis };
