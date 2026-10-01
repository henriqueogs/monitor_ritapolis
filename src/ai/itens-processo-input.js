'use strict';

// Pure input identity shared by the writer, planner and public reader. Never
// import the AI/provider/DB here: public reads must not enqueue work or write.
const crypto = require('crypto');
const { normalizeText } = require('../utils/text');
const CONTRACT_VERSION = 'itens-processo-v1.1-full';
const TIPOS_ATA_RESULTADO = ['ata', 'classificacao', 'resultado', 'homologacao', 'contrato'];
const digest = value => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');

function fontesDoProcesso(documento, atas = []) {
  return [
    {
      chave: `documento:${documento.id}`,
      id: documento.id,
      tipo: 'edital',
      nome: documento.titulo ? normalizeText(documento.titulo) : null,
      url:
        documento.url_pdf || documento.url_origem
          ? normalizeText(documento.url_pdf || documento.url_origem)
          : null,
      texto: normalizeText(documento.texto_completo || ''),
    },
    ...atas.map((a, index) => ({
      chave: `anexo:${a.id ?? index}`,
      id: a.id ?? null,
      tipo: a.tipo,
      nome: a.nome || null,
      url: a.url || null,
      texto: String(a.texto_completo || ''),
    })),
  ];
}

// Preserve old content identity for small verified legacy results; the new
// manifest also binds identities/URLs, so equal text on a different source
// cannot silently validate a checkpoint or a public attribution.
function computeTextoHash(documento, atas = []) {
  return digest(
    `${normalizeText(documento.texto_completo)}|${atas.map(a => a.texto_completo).join('|')}`
  );
}
function sourceManifest(fontes) {
  return fontes.map(({ chave, id, tipo, nome, url, texto }) => ({
    chave,
    id,
    tipo,
    nome,
    url,
    caracteres: texto.length,
    texto_hash: digest(texto),
  }));
}
function computeSourcesHash(fontes) {
  return digest(JSON.stringify(sourceManifest(fontes)));
}
function computeInputHash(documento, atas = []) {
  return computeSourcesHash(fontesDoProcesso(documento, atas));
}
function legacyInputWasComplete(fontes) {
  return (
    fontes.length <= 6 &&
    fontes.every(
      (f, index) =>
        f.texto.trim() &&
        f.texto.length <= 60000 &&
        (index === 0 || TIPOS_ATA_RESULTADO.includes(f.tipo))
    )
  );
}

module.exports = {
  CONTRACT_VERSION,
  TIPOS_ATA_RESULTADO,
  digest,
  fontesDoProcesso,
  computeTextoHash,
  computeInputHash,
  sourceManifest,
  computeSourcesHash,
  legacyInputWasComplete,
};
