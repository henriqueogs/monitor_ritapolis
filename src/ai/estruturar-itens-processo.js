'use strict';

const { createAiProvider } = require('./providers');
const { listarAnexosDocumento } = require('../db/inteligencia-fatos-repo');
const {
  salvarItensEstruturados,
  getUltimoItensEstruturadosPorDocumento,
} = require('../db/itens-estruturacao-jobs-repo');
const {
  CONTRACT_VERSION,
  computeTextoHash,
  computeInputHash,
  fontesDoProcesso,
  computeSourcesHash,
} = require('./itens-processo-input');
const { extractAllItems } = require('./itens-processo-full');
const { assessItemsResult } = require('./itens-processo-evidence');

// Historical name kept for callers; extraction now covers EVERY attached
// source, not just the first five result-type attachments. Missing source
// text blocks complete publication rather than being silently omitted.
function listarAtasDoDocumento(documentoId) {
  return listarAnexosDocumento(documentoId);
}

async function gerarItensProcesso(documento, options = {}) {
  if (!documento?.texto_completo?.trim()) {
    throw new Error(`Documento ${documento?.id} nao tem texto_completo para reextrair itens`);
  }
  const atas = options.atas || listarAtasDoDocumento(documento.id);
  const provider = options.provider || createAiProvider();
  const validado = await extractAllItems(
    documento,
    fontesDoProcesso(documento, atas),
    provider,
    options.progress
  );
  return {
    itens_json: validado,
    provider: provider.provider,
    modelo: provider.model,
    texto_hash: computeTextoHash(documento, atas),
    atas,
  };
}

async function estruturarItensProcesso(documento, options = {}) {
  const atas = options.atas || listarAtasDoDocumento(documento.id);
  const cached = getUltimoItensEstruturadosPorDocumento(documento.id);
  if (!options.force && assessItemsResult(cached, documento, atas).valid) {
    return cached;
  }
  const gerado = await gerarItensProcesso(documento, { ...options, atas });
  if (!options.atas) {
    const atual = require('../db').getDocumentoById(documento.id);
    if (
      !atual ||
      computeSourcesHash(fontesDoProcesso(atual, listarAtasDoDocumento(atual.id))) !==
        gerado.itens_json.cobertura_fontes.fontes_hash
    ) {
      throw new Error('Itens: fonte mudou durante o processamento; resultado nao publicado');
    }
  }
  return salvarItensEstruturados({
    documento_id: documento.id,
    provider: gerado.provider,
    modelo: gerado.modelo,
    contrato_versao: CONTRACT_VERSION,
    itens_json: gerado.itens_json,
    texto_hash: gerado.texto_hash,
    confianca: gerado.itens_json.confianca,
    status: 'ok',
    erro: null,
  });
}

module.exports = {
  estruturarItensProcesso,
  gerarItensProcesso,
  computeTextoHash,
  computeInputHash,
  CONTRACT_VERSION,
  listarAtasDoDocumento,
  assessItemsResult,
};
