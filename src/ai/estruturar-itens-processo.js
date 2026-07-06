'use strict';

// Reextração completa dos itens de um processo via IA — substitui a
// heurística/regex quando disponível com confiança suficiente. Mesmo padrão
// de summarize-anexo.js: monta prompt, chama provider, valida contrato,
// persiste (idempotente por hash de texto).

const crypto = require('crypto');
const { createAiProvider } = require('./providers');
const { buildItensProcessoPrompt } = require('./prompts/itens-processo-prompt');
const { validateItensProcesso } = require('./contracts/itens-processo-contract');
const { listarAnexosDocumento } = require('../db/inteligencia-fatos-repo');
const { salvarItensEstruturados } = require('../db/itens-estruturacao-jobs-repo');

const CONTRACT_VERSION = 'itens-processo-v1.0';

// Mesmos tipos de anexo considerados "resultado" pelo enriquecimento
// heurístico (src/db/index.js RESULTADO_ANEXO_TIPOS) — atas, classificação,
// resultado declarado, homologação, contrato.
const TIPOS_ATA_RESULTADO = ['ata', 'classificacao', 'resultado', 'homologacao', 'contrato'];

function textoHash(texto) {
  return crypto.createHash('sha256').update(String(texto || ''), 'utf8').digest('hex');
}

function extractJsonObject(raw) {
  const text = String(raw || '').trim();
  if (!text) {throw new Error('Resposta vazia da IA');}
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {throw new Error('Resposta da IA nao contem JSON valido');}
    return JSON.parse(text.slice(start, end + 1));
  }
}

function listarAtasDoDocumento(documentoId) {
  return listarAnexosDocumento(documentoId)
    .filter((a) => TIPOS_ATA_RESULTADO.includes(a.tipo) && a.texto_completo);
}

// Mesmo hash usado internamente pra upsert idempotente — exportado pro
// backfill em lote decidir se um documento já foi processado com o texto
// atual (edital + atas), sem precisar chamar a IA de novo.
function computeTextoHash(documento, atas) {
  return textoHash(`${documento.texto_completo}|${(atas || []).map((a) => a.texto_completo).join('|')}`);
}

/**
 * Chama a IA e valida o contrato, sem persistir — usado pelo piloto (Fase F)
 * pra inspecionar a saída antes de decidir gravar em massa.
 * @returns {{ itens_json, provider, modelo, texto_hash, atas }}
 */
async function gerarItensProcesso(documento, options = {}) {
  if (!documento?.texto_completo) {
    throw new Error(`Documento ${documento?.id} nao tem texto_completo para reextrair itens`);
  }

  const atas = options.atas || listarAtasDoDocumento(documento.id);
  const prompt = buildItensProcessoPrompt({ documento, atas });
  const hash = textoHash(`${documento.texto_completo}|${atas.map((a) => a.texto_completo).join('|')}`);

  const provider = options.provider || createAiProvider();
  const raw = await provider.generateJson({ prompt, temperature: 0.1 });
  const validado = validateItensProcesso(extractJsonObject(raw));

  return { itens_json: validado, provider: provider.provider, modelo: provider.model, texto_hash: hash, atas };
}

/**
 * Reextrai os itens de um processo (edital + atas vinculadas) via IA e
 * persiste o resultado. Lança erro em qualquer falha (texto ausente,
 * resposta fora do contrato) — quem chama decide o fallback (worker grava
 * status='erro' no job; script de piloto mostra o erro pra inspeção).
 */
async function estruturarItensProcesso(documento, options = {}) {
  const gerado = await gerarItensProcesso(documento, options);

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
  CONTRACT_VERSION,
  listarAtasDoDocumento,
};
