const { ZodError } = require('zod');
const { SummaryContract } = require('./contracts/summary-contract');

const enumValues = {
  tipo_documento: ['edital', 'decreto', 'portaria', 'lei', 'contrato', 'despesa', 'ata', 'outro'],
  data_tipo: ['publicacao', 'abertura', 'vigencia', 'homologacao', 'assinatura', 'outro'],
  valor_tipo: ['estimado', 'final', 'global', 'mensal', 'unitario', 'outro'],
  valor_final_tipo: ['unitario', 'total_item', 'lote', 'global', 'indefinido'],
  papel: ['contratante', 'contratado', 'autoridade', 'fornecedor', 'orgao_publico', 'outro'],
  nivel_risco: ['baixo', 'medio', 'alto']
};

function extractJsonText(rawContent) {
  const content = String(rawContent || '').trim();
  if (!content) {
    throw new Error('Resposta vazia do provider de IA');
  }

  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return content.slice(firstBrace, lastBrace + 1).trim();
  }

  return content;
}

function parseSummaryResponse(rawContent) {
  const jsonText = extractJsonText(rawContent);

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Resposta da IA nao retornou JSON valido: ${error.message}`);
  }
}

function normalizeEnumValue(value, allowedValues, fallback = 'outro') {
  if (value == null || value === '') {
    return fallback;
  }

  const text = String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (allowedValues.includes(text)) {
    return text;
  }

  if (allowedValues === enumValues.tipo_documento) {
    if (/edital|licitacao|pregao|concorrencia|dispensa|inexigibilidade/.test(text)) return 'edital';
    if (/decreto/.test(text)) return 'decreto';
    if (/portaria/.test(text)) return 'portaria';
    if (/lei/.test(text)) return 'lei';
    if (/contrato|termo_aditivo/.test(text)) return 'contrato';
    if (/despesa|empenho|pagamento/.test(text)) return 'despesa';
    if (/ata/.test(text)) return 'ata';
  }

  if (allowedValues === enumValues.papel) {
    if (/contratante|prefeitura|municipio|municipal|orgao/.test(text)) return 'contratante';
    if (/contratad|empresa|vencedor|fornecedor/.test(text)) return 'contratado';
    if (/autoridade|prefeito|secretari|pregoeir|presidente/.test(text)) return 'autoridade';
  }

  if (allowedValues === enumValues.data_tipo) {
    if (/abertura|sessao|certame/.test(text)) return 'abertura';
    if (/publica/.test(text)) return 'publicacao';
    if (/vigencia|validade/.test(text)) return 'vigencia';
    if (/homologa/.test(text)) return 'homologacao';
    if (/assinatura|assinado/.test(text)) return 'assinatura';
  }

  if (allowedValues === enumValues.valor_tipo) {
    if (/estimad|referencia/.test(text)) return 'estimado';
    if (/final|homologad|contratad/.test(text)) return 'final';
    if (/global|total/.test(text)) return 'global';
    if (/mensal/.test(text)) return 'mensal';
    if (/unit/.test(text)) return 'unitario';
  }

  if (allowedValues === enumValues.valor_final_tipo) {
    if (/unit/.test(text)) return 'unitario';
    if (/total|item_total/.test(text)) return 'total_item';
    if (/lote/.test(text)) return 'lote';
    if (/global/.test(text)) return 'global';
    return 'indefinido';
  }

  if (allowedValues === enumValues.nivel_risco) {
    if (/alto|grave/.test(text)) return 'alto';
    if (/medio|moderado/.test(text)) return 'medio';
    return 'baixo';
  }

  return fallback;
}

function normalizeDateValue(value) {
  if (value == null || value === '') {
    return null;
  }

  const text = String(value).trim();
  if (!text || /^null|n\/a|nao informado|não informado|sem data$/i.test(text)) {
    return null;
  }

  const isoMatch = text.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const brMatch = text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  }

  return text;
}

function normalizeOptionalText(value) {
  if (value == null) return null;

  const text = String(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();

  return text.length ? text : null;
}

function normalizeRequiredText(value) {
  return normalizeOptionalText(value) || '';
}

function normalizeNumberValue(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const text = String(value)
    .replace(/[^\d,.-]/g, '')
    .trim();

  if (!text) return null;

  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePositiveNumberValue(value) {
  const parsed = normalizeNumberValue(value);
  return parsed && parsed > 0 ? parsed : null;
}

function normalizeSummaryBeforeValidation(summary) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return summary;
  }

  const hasSourceExcerpt = (item) => Boolean(normalizeOptionalText(item?.trecho_fonte));
  const hasRequiredText = (value) => Boolean(normalizeOptionalText(value));
  const pontosPrincipais = Array.isArray(summary.pontos_principais)
    ? summary.pontos_principais.map(normalizeOptionalText).filter(Boolean)
    : summary.pontos_principais;
  const normalizedObject =
    summary.objeto && typeof summary.objeto === 'object'
      ? {
          ...summary.objeto,
          descricao: normalizeOptionalText(summary.objeto.descricao),
          trecho_fonte: hasSourceExcerpt(summary.objeto) ? normalizeRequiredText(summary.objeto.trecho_fonte) : null
        }
      : { descricao: null, trecho_fonte: null };
  const firstMainPoint = Array.isArray(pontosPrincipais) ? pontosPrincipais[0] : null;
  const title = normalizeRequiredText(summary.titulo_curto);
  const citizenSummary = normalizeRequiredText(summary.resumo_cidadao);
  const technicalSummary = normalizeRequiredText(summary.resumo_tecnico);
  const fallbackText =
    normalizeOptionalText(normalizedObject.descricao) ||
    firstMainPoint ||
    'Trecho de documento publico municipal sem informacoes suficientes para resumo detalhado.';
  const usedFallback = !title || !citizenSummary || !technicalSummary;
  const rawConfidence = Number(summary.confianca);
  const confidence = Number.isFinite(rawConfidence) ? Math.min(1, Math.max(0, rawConfidence)) : 0.35;

  return {
    ...summary,
    tipo_documento: normalizeEnumValue(summary.tipo_documento, enumValues.tipo_documento),
    titulo_curto: title || fallbackText.slice(0, 120),
    resumo_cidadao: citizenSummary || fallbackText,
    resumo_tecnico: technicalSummary || fallbackText,
    pontos_principais: pontosPrincipais,
    datas_relevantes: Array.isArray(summary.datas_relevantes)
      ? summary.datas_relevantes
          .filter((item) => hasSourceExcerpt(item) && hasRequiredText(item?.descricao))
          .map((item) => ({
            ...item,
            tipo: normalizeEnumValue(item?.tipo, enumValues.data_tipo),
            data: normalizeDateValue(item?.data),
            descricao: normalizeRequiredText(item?.descricao),
            trecho_fonte: normalizeRequiredText(item?.trecho_fonte)
          }))
      : summary.datas_relevantes,
    valores: Array.isArray(summary.valores)
      ? summary.valores
          .filter((item) => hasSourceExcerpt(item) && hasRequiredText(item?.descricao))
          .map((item) => ({
            ...item,
            tipo: normalizeEnumValue(item?.tipo, enumValues.valor_tipo),
            moeda: normalizeRequiredText(item?.moeda || 'BRL'),
            descricao: normalizeRequiredText(item?.descricao),
            trecho_fonte: normalizeRequiredText(item?.trecho_fonte)
          }))
      : summary.valores,
    partes_envolvidas: Array.isArray(summary.partes_envolvidas)
      ? summary.partes_envolvidas
          .filter((item) => hasSourceExcerpt(item) && hasRequiredText(item?.nome))
          .map((item) => ({
            ...item,
            nome: normalizeRequiredText(item?.nome),
            papel: normalizeEnumValue(item?.papel, enumValues.papel),
            documento: normalizeOptionalText(item?.documento),
            trecho_fonte: normalizeRequiredText(item?.trecho_fonte)
          }))
      : summary.partes_envolvidas,
    itens_licitados: Array.isArray(summary.itens_licitados)
      ? summary.itens_licitados
          .filter((item) => hasSourceExcerpt(item) && hasRequiredText(item?.descricao))
          .map((item) => ({
            item_numero: normalizeOptionalText(item?.item_numero),
            lote_numero: normalizeOptionalText(item?.lote_numero),
            descricao: normalizeRequiredText(item?.descricao),
            unidade: normalizeOptionalText(item?.unidade),
            quantidade: normalizePositiveNumberValue(item?.quantidade),
            valor_unitario_estimado: normalizePositiveNumberValue(item?.valor_unitario_estimado),
            valor_total_estimado: normalizePositiveNumberValue(item?.valor_total_estimado),
            valor_unitario_final: normalizePositiveNumberValue(item?.valor_unitario_final),
            valor_total_final: normalizePositiveNumberValue(item?.valor_total_final),
            valor_final_tipo: normalizeEnumValue(item?.valor_final_tipo, enumValues.valor_final_tipo, null),
            valor_lote_final: normalizePositiveNumberValue(item?.valor_lote_final),
            valor_global_final: normalizePositiveNumberValue(item?.valor_global_final),
            fornecedor_nome: normalizeOptionalText(item?.fornecedor_nome),
            fornecedor_cnpj: normalizeOptionalText(item?.fornecedor_cnpj),
            trecho_fonte: normalizeRequiredText(item?.trecho_fonte)
          }))
      : [],
    objeto: normalizedObject,
    riscos_ou_alertas: Array.isArray(summary.riscos_ou_alertas)
      ? summary.riscos_ou_alertas
          .filter((item) => hasRequiredText(item?.descricao) && hasRequiredText(item?.motivo))
          .map((item) => ({
            ...item,
            nivel: normalizeEnumValue(item?.nivel, enumValues.nivel_risco, 'baixo'),
            descricao: normalizeRequiredText(item?.descricao),
            motivo: normalizeRequiredText(item?.motivo)
          }))
      : summary.riscos_ou_alertas,
    campos_nao_encontrados: Array.isArray(summary.campos_nao_encontrados)
      ? summary.campos_nao_encontrados.map(normalizeOptionalText).filter(Boolean)
      : summary.campos_nao_encontrados,
    confianca: usedFallback ? Math.min(confidence, 0.35) : confidence
  };
}

function validateSummary(summary) {
  try {
    return SummaryContract.parse(normalizeSummaryBeforeValidation(summary));
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues
        .map((issue) => `${issue.path.join('.') || 'raiz'}: ${issue.message}`)
        .join('; ');
      throw new Error(`Resumo fora do contrato esperado: ${issues}`);
    }

    throw error;
  }
}

module.exports = {
  extractJsonText,
  parseSummaryResponse,
  validateSummary,
  normalizeEnumValue,
  normalizeDateValue,
  normalizeOptionalText,
  normalizeSummaryBeforeValidation
};
