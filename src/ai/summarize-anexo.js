'use strict';

// Resumo de anexo via IA real, com fallback heurístico transparente.
// Substitui o antigo resumirAnexoLocal (só "primeira frase >40 chars") como
// caminho principal — o heurístico vira fallback explícito, nunca escondido.

const crypto = require('crypto');
const config = require('../config');
const logger = require('../logger');
const { createAiProvider } = require('./providers');
const { buildAnexoResumoPrompt } = require('./prompts/anexo-resumo-prompt');
const { validateAnexoResumo } = require('./contracts/anexo-resumo-contract');
const { isImageBasedPdf } = require('../parsers/pdf');
const { resumirAnexoLocal } = require('../inteligencia/fatos-extractor');
const { salvarResumoAnexo } = require('../db/inteligencia-fatos-repo');

const CONTRACT_VERSION_IA = 'anexo-2.0';
const CONTRACT_VERSION_HEURISTICO = 'anexo-1.0';

function textoHash(texto) {
  return crypto.createHash('sha256').update(String(texto || ''), 'utf8').digest('hex');
}

function extractJsonObject(raw) {
  const text = String(raw || '').trim();
  if (!text) {
    throw new Error('Resposta vazia da IA');
  }
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('Resposta da IA nao contem JSON valido');
    }
    return JSON.parse(text.slice(start, end + 1));
  }
}

// Gate de qualidade: reaproveita a heurística já usada para decidir se um PDF
// é imagem/ruído de OCR (§ mesma lógica de src/parsers/pdf.js). Texto ruim
// mandado para a IA produz resumo "confiante" mas falso — melhor não tentar.
function textoConfiavelParaIa(texto) {
  return !isImageBasedPdf(texto, 1);
}

function heuristico(anexo, motivo) {
  const resumo = resumirAnexoLocal({ anexo, fatos: [] });
  return {
    contrato_versao: CONTRACT_VERSION_HEURISTICO,
    provider: 'local',
    modelo: 'heuristico-anexo',
    resumo_json: resumo,
    confianca: resumo.confianca,
    erro: motivo || null,
  };
}

async function gerarViaIa(anexo, documento, provider) {
  const prompt = buildAnexoResumoPrompt({ anexo, documento, texto: anexo.texto_completo });
  const raw = await provider.generateJson({ prompt, temperature: 0.15 });
  const validado = validateAnexoResumo(extractJsonObject(raw));
  return {
    contrato_versao: CONTRACT_VERSION_IA,
    provider: provider.provider,
    modelo: provider.model,
    resumo_json: {
      aviso: 'Resumo gerado por IA a partir do texto extraído do anexo.',
      anexo: { nome: anexo.nome || null, tipo: anexo.tipo || null, status_extracao: anexo.status_extracao || null },
      ...validado,
    },
    confianca: validado.confianca,
    erro: null,
  };
}

// Resume um anexo: usa IA quando o texto tem qualidade suficiente e
// AI_SUMMARY_ENABLED está ligado; cai para o heurístico local em qualquer
// outro caso (texto ruim, IA desligada, erro/fora-do-contrato) — nunca falha
// silenciosamente, o motivo do fallback fica em `erro`.
async function summarizeAnexo(anexo, options = {}) {
  const hash = anexo.texto_hash || textoHash(anexo.texto_completo);
  let resultado;

  if (!config.aiSummaryEnabled) {
    resultado = heuristico(anexo, 'AI_SUMMARY_ENABLED=false');
  } else if (!textoConfiavelParaIa(anexo.texto_completo)) {
    resultado = heuristico(anexo, 'texto_baixa_qualidade_ocr');
  } else {
    try {
      const provider = options.provider || createAiProvider();
      resultado = await gerarViaIa(anexo, options.documento, provider);
    } catch (err) {
      logger.warn('Resumo de anexo: fallback heuristico', { anexoId: anexo.id, erro: err.message });
      resultado = heuristico(anexo, err.message);
    }
  }

  const registro = salvarResumoAnexo({
    anexo_id: anexo.id,
    provider: resultado.provider,
    modelo: resultado.modelo,
    contrato_versao: resultado.contrato_versao,
    resumo_json: resultado.resumo_json,
    texto_hash: hash,
    confianca: resultado.confianca,
    status: 'ok',
    erro: resultado.erro,
  });

  return { ...resultado, id: registro.id, texto_hash: hash };
}

module.exports = {
  CONTRACT_VERSION_IA,
  CONTRACT_VERSION_HEURISTICO,
  textoConfiavelParaIa,
  summarizeAnexo,
};
