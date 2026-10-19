'use strict';

/**
 * Extração de itens fora da VM para documentos que o pipeline parou por tempo
 * (teto por documento) ou RAM. Funções puras, sem banco: o script
 * `scripts/itens-local.js` exporta da VM, gera aqui e reimporta na VM.
 *
 * Fidelidade: o resultado importado NÃO é confiável por vir de arquivo — a VM
 * revalida texto, anexos, cobertura, contrato e citações com o mesmo
 * `assessItemsResult` que o pipeline usa.
 */

const {
  CONTRACT_VERSION,
  computeTextoHash,
  computeInputHash,
  fontesDoProcesso,
} = require('./itens-processo-input');
const { extractAllItems } = require('./itens-processo-full');
const { assessItemsResult } = require('./itens-processo-evidence');

const CAMPOS_DOCUMENTO = [
  'id',
  'titulo',
  'tipo',
  'ano',
  'data_publicacao',
  'url_pdf',
  'url_origem',
  'texto_completo',
];

function montarPacote({ documento, atas = [] }) {
  const enxuto = Object.fromEntries(
    CAMPOS_DOCUMENTO.filter((campo) => campo in documento).map((campo) => [campo, documento[campo]])
  );
  return {
    documento: enxuto,
    atas,
    texto_hash: computeTextoHash(documento, atas),
    input_hash: computeInputHash(documento, atas),
    contrato_versao: CONTRACT_VERSION,
  };
}

async function gerarLocal(pacote, { provider }) {
  const { documento, atas } = pacote;
  const itensJson = await extractAllItems(documento, fontesDoProcesso(documento, atas), provider);
  return {
    documento_id: documento.id,
    provider: provider.provider,
    modelo: provider.model,
    contrato_versao: CONTRACT_VERSION,
    texto_hash: computeTextoHash(documento, atas),
    confianca: itensJson.confianca,
    itens_json: itensJson,
  };
}

function verificarResultado({ resultado, documento, atas = [] }) {
  const avaliacao = assessItemsResult({ ...resultado, status: 'ok' }, documento, atas);
  return avaliacao.valid ? { ok: true } : { ok: false, motivo: avaliacao.reason };
}

module.exports = { montarPacote, gerarLocal, verificarResultado };
