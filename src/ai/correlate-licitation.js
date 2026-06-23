const config = require('../config');
const logger = require('../logger');
const {
  buildLicitacaoLeituraIntegradaPayload,
  getResumoAiByDocumentoHash,
  saveResumoAi
} = require('../db');
const { estimateTokensFromText } = require('./estimate-tokens');
const { buildIntegratedReadingPrompt } = require('./prompts/integrated-reading-prompt');
const { IntegratedReadingContract } = require('./contracts/integrated-reading-contract');
const { createAiProvider } = require('./providers');

const CONTRACT_VERSION = '2.0';

function ensureAiEnabled() {
  if (!config.aiSummaryEnabled) {
    throw new Error('AI_SUMMARY_ENABLED=false; leitura integrada desativada');
  }
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

function validateIntegratedReading(value) {
  const parsed = IntegratedReadingContract.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'raiz'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Leitura integrada fora do contrato 2.0: ${issues}`);
  }
  return parsed.data;
}

function normalizeForQuality(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeFieldName(value) {
  return normalizeForQuality(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function buildReadingText(reading) {
  return [
    reading?.titulo,
    reading?.leitura_integrada,
    ...(Array.isArray(reading?.pontos_principais) ? reading.pontos_principais : []),
    ...(Array.isArray(reading?.consistencia) ? reading.consistencia.map((item) => item.descricao) : []),
    ...(Array.isArray(reading?.alertas) ? reading.alertas.map((item) => item.descricao) : [])
  ].join(' ');
}

function estimateIntegratedReadingConfidence(payload) {
  let score = 0.35;
  const produtosResumo = payload?.produtos_resumo || {};
  const detalhes = payload?.licitacao_detalhes || {};

  if (Number(produtosResumo.total || 0) > 0) {score += 0.12;}
  if (Number(produtosResumo.com_preco_final || 0) > 0) {score += 0.16;}
  if (Number(produtosResumo.com_fornecedor || 0) > 0) {score += 0.12;}
  if (detalhes.valor_final !== null) {score += 0.12;}
  if (detalhes.vencedor_nome || detalhes.vencedor_cnpj) {score += 0.1;}
  if (payload?.grupo) {score += 0.06;}
  if (Array.isArray(payload?.fontes_pncp) && payload.fontes_pncp.length) {score += 0.1;}

  return Number(Math.min(score, 0.86).toFixed(2));
}

function findIntegratedReadingQualityIssues(reading, payload) {
  const text = normalizeForQuality(buildReadingText(reading));
  const issues = [];
  const produtosResumo = payload?.produtos_resumo || {};
  const produtosComPrecoFinal = Number(produtosResumo.com_preco_final || 0);

  if (
    produtosComPrecoFinal > 0 &&
    (
      /os valores ainda nao (foram )?definidos/.test(text) ||
      /precos ainda nao (foram )?definidos/.test(text) ||
      /nao ha precos finais/.test(text)
    )
  ) {
    issues.push(
      `Ha ${produtosComPrecoFinal} produto(s) com preco final estruturado; nao diga que os valores/precos ainda nao foram definidos. Diferencie isso de valor final/global consolidado.`
    );
  }

  if (
    payload?.licitacao_detalhes?.valor_final !== null &&
    /valor final (nao|sem|ausente|nao informado)/.test(text)
  ) {
    issues.push('Ha valor final local consolidado em licitacao_detalhes.valor_final; nao marque valor_final como ausente.');
  }

  return issues;
}

function normalizeIntegratedReadingQuality(reading, payload) {
  const normalized = {
    ...reading,
    confianca: Number(reading.confianca || 0)
  };
  const hiddenGapFields = new Set([
    'confianca',
    'origem',
    'origem_detalhe',
    'trecho_fonte',
    'hash_conteudo',
    'texto_hash',
    'payload_json'
  ]);
  const lowSignalConsistencyFields = new Set([
    'produtos_total_estruturado',
    'produtos_resumo_com_preco_final',
    'produtos_resumo_com_fornecedor',
    'contrato_versao'
  ]);
  const knownGapLabels = {
    sem_produtos_estruturados: {
      campo: 'produtos_estruturados',
      descricao: 'Produtos ou itens não foram estruturados nesta licitação.'
    },
    produtos_estruturados: {
      campo: 'produtos_estruturados',
      descricao: 'Produtos ou itens não foram estruturados nesta licitação.'
    },
    sem_correspondencia_pncp: {
      campo: 'pncp',
      descricao: 'Não há correspondência PNCP salva para esta licitação.'
    },
    correspondencia_pncp: {
      campo: 'pncp',
      descricao: 'Não há correspondência PNCP salva para esta licitação.'
    },
    sem_valor_final_local: {
      campo: 'valor_final',
      descricao: 'Não há valor final ou global consolidado nos dados locais.'
    },
    sem_vencedor_local: {
      campo: 'vencedor',
      descricao: 'Não há vencedor consolidado nos dados locais.'
    }
  };
  const hasPncp = Array.isArray(payload?.fontes_pncp) && payload.fontes_pncp.length > 0;
  const hasDivergencias = Array.isArray(payload?.divergencias) && payload.divergencias.length > 0;
  const normalizeGap = (item) => {
    const field = normalizeFieldName(item?.campo);
    if (knownGapLabels[field]) {
      return knownGapLabels[field];
    }
    return item;
  };
  const isMissingDescription = (value) =>
    /(\bausente\b|ausencia|nao informado|não informado|nao ha|não há|sem correspondencia|sem correspondência|nao localizado|não localizado)/.test(
      normalizeForQuality(value)
    );

  normalized.lacunas = (Array.isArray(normalized.lacunas) ? normalized.lacunas : [])
    .map(normalizeGap)
    .filter((item) => {
      const field = normalizeFieldName(item?.campo);
      if (hiddenGapFields.has(field)) {return false;}
      if (payload?.licitacao_detalhes?.vencedor_nome && ['fornecedor_nome', 'vencedor_nome'].includes(field)) {
        return false;
      }
      if (payload?.licitacao_detalhes?.vencedor_cnpj && ['fornecedor_cnpj', 'vencedor_cnpj'].includes(field)) {
        return false;
      }
      if (payload?.licitacao_detalhes?.valor_final !== null && field === 'valor_final') {
        return false;
      }
      return true;
    });
  normalized.consistencia = (Array.isArray(normalized.consistencia) ? normalized.consistencia : [])
    .map((item) => {
      const _field = normalizeFieldName(item?.campo);
      if (
        item?.status === 'divergente' &&
        isMissingDescription(`${item.campo} ${item.descricao}`) &&
        (!hasPncp || !hasDivergencias)
      ) {
        return {
          ...item,
          status: 'incompleto'
        };
      }
      return item;
    })
    .filter((item) => {
      const field = normalizeFieldName(item?.campo);
      if (hiddenGapFields.has(field) || lowSignalConsistencyFields.has(field)) {return false;}
      if (
        ['numero_pncp', 'pncp'].includes(field) &&
        !hasPncp &&
        isMissingDescription(`${item?.campo} ${item?.descricao}`)
      ) {
        return false;
      }
      if (
        ['valor_estimado', 'valor_final'].includes(field) &&
        item?.status === 'incompleto' &&
        isMissingDescription(`${item?.campo} ${item?.descricao}`)
      ) {
        return false;
      }
      return true;
    });

  normalized.alertas = (Array.isArray(normalized.alertas) ? normalized.alertas : [])
    .filter((item) => {
      const text = normalizeForQuality(item?.descricao);
      if (!hasPncp && /pncp/.test(text) && /(ausente|ausencia|nao ha|nao informado|sem correspondencia|nao localizado)/.test(text)) {
        return false;
      }
      if (/nao ha divergencia de conteudo/.test(text)) {
        return false;
      }
      if (/divergencia entre valor estimado ausente/.test(text)) {
        return false;
      }
      return true;
    })
    .map((item) => {
      const text = normalizeForQuality(item?.descricao);
      if (item?.nivel === 'alto' && /(ausente|ausencia|nao informado|nao ha|sem )/.test(text)) {
        return {
          ...item,
          nivel: 'medio'
        };
      }
      return item;
    });

  if (normalized.confianca <= 0.05) {
    normalized.confianca = estimateIntegratedReadingConfidence(payload);
  }

  return normalized;
}

function normalizeSavedIntegratedReading(documentoId, leituraJson) {
  const { payload } = buildLicitacaoLeituraIntegradaPayload(documentoId);
  return normalizeIntegratedReadingQuality(validateIntegratedReading(leituraJson), payload);
}

function buildResultPayload({ documentoId, registro, textoHash, payload, reused }) {
  return {
    documento_id: documentoId,
    provider: registro.provider,
    modelo: registro.modelo,
    contrato_versao: registro.contrato_versao,
    texto_hash: textoHash,
    leitura_integrada: registro.resumo_json,
    payload_entrada: payload,
    confianca: registro.resumo_json?.confianca ?? null,
    criado_em: registro.criado_em,
    atualizado_em: registro.atualizado_em,
    reutilizado: reused,
    status: registro.status
  };
}

async function correlateLicitation(documentoId, options = {}) {
  ensureAiEnabled();

  const provider = options.provider || createAiProvider();
  const { payload, texto_hash: textoHash } = buildLicitacaoLeituraIntegradaPayload(documentoId);
  const cached = getResumoAiByDocumentoHash(documentoId, textoHash, CONTRACT_VERSION);

  if (cached?.status === 'ok' && !options.force) {
    return buildResultPayload({
      documentoId,
      registro: cached,
      textoHash,
      payload,
      reused: true
    });
  }

  const payloadJson = JSON.stringify(payload, null, 2);
  const prompt = buildIntegratedReadingPrompt({ payloadJson });

  try {
    let lastQualityIssues = [];
    let validated = null;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const qualityInstruction = lastQualityIssues.length
        ? `\n\nCorrecao obrigatoria antes de responder:\n- ${lastQualityIssues.join('\n- ')}`
        : '';
      const rawResponse = await provider.generateJson({
        prompt: `${prompt}${qualityInstruction}`,
        temperature: 0
      });
      const candidate = normalizeIntegratedReadingQuality(
        validateIntegratedReading(extractJsonObject(rawResponse)),
        payload
      );
      lastQualityIssues = findIntegratedReadingQualityIssues(candidate, payload);
      if (!lastQualityIssues.length) {
        validated = candidate;
        break;
      }
    }

    if (!validated) {
      throw new Error(`Leitura integrada contradiz dados estruturados: ${lastQualityIssues.join('; ')}`);
    }

    const registro = saveResumoAi({
      documento_id: documentoId,
      provider: provider.provider,
      modelo: provider.model,
      contrato_versao: CONTRACT_VERSION,
      resumo_json: validated,
      texto_hash: textoHash,
      tokens_estimados: estimateTokensFromText(payloadJson),
      status: 'ok',
      erro: null
    });

    return buildResultPayload({
      documentoId,
      registro,
      textoHash,
      payload,
      reused: false
    });
  } catch (error) {
    saveResumoAi({
      documento_id: documentoId,
      provider: provider.provider,
      modelo: provider.model,
      contrato_versao: CONTRACT_VERSION,
      resumo_json: { erro_processamento: error.message },
      texto_hash: textoHash,
      tokens_estimados: estimateTokensFromText(payloadJson),
      status: 'erro',
      erro: error.message
    });

    logger.error('Falha ao gerar leitura integrada de licitacao', {
      documentoId,
      provider: provider.provider,
      modelo: provider.model,
      erro: error.message
    });

    throw error;
  }
}

module.exports = {
  CONTRACT_VERSION,
  correlateLicitation,
  normalizeIntegratedReadingQuality,
  normalizeSavedIntegratedReading,
  validateIntegratedReading
};
