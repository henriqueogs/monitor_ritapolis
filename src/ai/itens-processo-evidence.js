'use strict';

const {
  CONTRACT_VERSION,
  fontesDoProcesso,
  computeTextoHash,
  computeSourcesHash,
  sourceManifest,
  legacyInputWasComplete,
} = require('./itens-processo-input');

function normalizedWithOffsets(value) {
  let text = '';
  const offsets = [];
  let offset = 0;
  for (const char of String(value)) {
    for (const normalized of char.normalize('NFKC')) {
      const next = /\s/u.test(normalized) ? ' ' : normalized;
      if (next === ' ' && text.endsWith(' ')) {
        continue;
      }
      text += next;
      for (let i = 0; i < next.length; i++) {
        offsets.push(offset);
      }
    }
    offset += char.length;
  }
  return { text, offsets };
}
const normalize = value => normalizedWithOffsets(value).text.trim();

function numericEvidence(quote, expected) {
  if (expected === null || expected === undefined) {
    return true;
  }
  // A numeric match is evidence only inside this row's literal quote, never
  // somewhere else in the document. Both official BR and JSON decimals work.
  const tokens = quote.match(/(?<![\d/])\d+(?:[.,]\d+)*(?![\d/])/g) || [];
  return tokens.some(token => {
    const candidates = [Number(token)];
    if (token.includes(',')) {
      candidates.push(Number(token.replace(/\./g, '').replace(',', '.')));
    } else if (/^\d{1,3}(\.\d{3})+$/.test(token)) {
      candidates.push(Number(token.replace(/\./g, '')));
    }
    return candidates.some(n => Number.isFinite(n) && Math.abs(n - expected) < 1e-9);
  });
}

function validateRowEvidence(row, slices) {
  const quote = normalize(row.trecho_fonte);
  if (
    !quote ||
    /não especificado no trecho fornecido|nao especificado no trecho fornecido/i.test(quote)
  ) {
    throw new Error('Itens: citacao ausente ou fabricada; exige revisao');
  }
  for (const field of [
    'descricao',
    'objeto',
    'fornecedor_nome',
    'unidade',
    'item_numero',
    'lote_numero',
  ]) {
    if (row[field] !== null && row[field] !== undefined) {
      const value = normalize(row[field]);
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const present = ['item_numero', 'lote_numero', 'fornecedor_nome'].includes(field)
        ? new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(quote)
        : quote.includes(value);
      if (!present) {
        throw new Error(`Itens: ${field} nao consta na citacao; exige revisao`);
      }
    }
  }
  if (row.fornecedor_cnpj !== null && row.fornecedor_cnpj !== undefined) {
    const digits = String(row.fornecedor_cnpj).replace(/\D/g, '');
    const candidates =
      quote.match(/(?<!\d)(?:\d{14}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})(?!\d)/g) || [];
    if (digits.length !== 14 || !candidates.some(v => v.replace(/\D/g, '') === digits)) {
      throw new Error('Itens: CNPJ nao consta na citacao; exige revisao');
    }
  }
  for (const field of ['quantidade', 'valor_estimado', 'teto_homologado', 'valor']) {
    if (!numericEvidence(quote, row[field])) {
      throw new Error(`Itens: ${field} nao consta na citacao; exige revisao`);
    }
  }
  const matches = new Map();
  for (const slice of slices) {
    if (row.fonte_chave && row.fonte_chave !== slice.chave) {
      continue;
    }
    const { text, offsets } = normalizedWithOffsets(slice.texto);
    let index = text.indexOf(quote);
    while (index !== -1) {
      const inicio = slice.inicio + offsets[index];
      const last = offsets[index + quote.length - 1];
      const finalChar = String(slice.texto).slice(last).codePointAt(0);
      const fim = slice.inicio + last + (finalChar > 0xffff ? 2 : 1);
      const fonte = { chave: slice.chave, id: slice.id, url: slice.url, inicio, fim };
      matches.set(`${fonte.chave}:${inicio}:${fim}`, fonte);
      index = text.indexOf(quote, index + quote.length);
    }
  }
  if (matches.size !== 1) {
    throw new Error(
      `Itens: citacao ${matches.size ? 'ambigua' : 'nao encontrada'} na fonte; exige revisao`
    );
  }
  return { ...row, fonte: [...matches.values()][0] };
}

function validateLeafEvidence(value, slices) {
  // Rows first: an unsupported citation is the real defect and is the only
  // failure the recovery path may retry; the table flag alone would hide it.
  const validated = {
    ...value,
    itens_solicitados: value.itens_solicitados.map(row => validateRowEvidence(row, slices)),
    resultado_lotes: value.resultado_lotes.map(row => validateRowEvidence(row, slices)),
    resultado_global: value.resultado_global
      ? validateRowEvidence(value.resultado_global, slices)
      : null,
  };
  if (
    !value.tem_tabela_itens &&
    (value.itens_solicitados.length || value.resultado_lotes.length || value.resultado_global)
  ) {
    throw new Error('Itens: ausencia de tabela contradiz as linhas extraidas');
  }
  return validated;
}

function completeCoverage(coverage, fontes) {
  if (
    coverage?.leitura_integral !== true ||
    coverage?.versao !== CONTRACT_VERSION ||
    coverage.fontes_hash !== computeSourcesHash(fontes) ||
    JSON.stringify(coverage.fontes) !== JSON.stringify(sourceManifest(fontes))
  ) {
    return false;
  }
  if (
    !Array.isArray(coverage.trechos) ||
    coverage.trechos.some(t => !fontes.some(f => f.chave === t.chave))
  ) {
    return false;
  }
  for (const source of fontes) {
    if (!source.texto.trim()) {
      return false;
    }
    const intervals = (coverage.trechos || [])
      .filter(t => t.chave === source.chave)
      .sort((a, b) => a.inicio - b.inicio);
    let end = 0;
    for (const interval of intervals) {
      if (
        !Number.isInteger(interval.inicio) ||
        !Number.isInteger(interval.fim) ||
        interval.inicio < 0 ||
        interval.inicio > end ||
        interval.fim <= interval.inicio ||
        interval.fim > source.texto.length
      ) {
        return false;
      }
      end = Math.max(end, interval.fim);
    }
    if (end !== source.texto.length) {
      return false;
    }
  }
  return true;
}

function assessItemsResult(record, documento, atas = []) {
  if (!record || record.status !== 'ok' || !documento?.texto_completo) {
    return { valid: false, reason: 'sem_resultado_verificado' };
  }
  if (record.texto_hash !== computeTextoHash(documento, atas)) {
    return { valid: false, reason: 'texto_atualizado' };
  }
  const fontes = fontesDoProcesso(documento, atas);
  const legacy = record.contrato_versao === 'itens-processo-v1.0';
  if (
    legacy
      ? !legacyInputWasComplete(fontes)
      : record.contrato_versao !== CONTRACT_VERSION ||
        !completeCoverage(record.itens_json?.cobertura_fontes, fontes)
  ) {
    return { valid: false, reason: 'leitura_incompleta_ou_nao_comprovada' };
  }
  try {
    const { validateItensProcessoStrict } = require('./contracts/itens-processo-contract');
    const data = validateItensProcessoStrict(record.itens_json, { full: !legacy });
    if (
      (data.itens_solicitados.length || data.resultado_lotes.length || data.resultado_global) &&
      (Number(record.confianca ?? data.confianca) < 0.5 || data.confianca < 0.5)
    ) {
      return { valid: false, reason: 'confianca_insuficiente' };
    }
    // Verify new provenance against the exact named source and offset. Legacy
    // rows are usable only when their quote has one unambiguous source match.
    for (const row of [
      ...data.itens_solicitados,
      ...data.resultado_lotes,
      ...(data.resultado_global ? [data.resultado_global] : []),
    ]) {
      const slices = legacy
        ? fontes.map(f => ({ ...f, inicio: 0 }))
        : fontes
            .filter(
              f =>
                f.chave === row.fonte?.chave && f.url === row.fonte?.url && f.id === row.fonte?.id
            )
            .map(f => ({
              ...f,
              inicio: row.fonte.inicio,
              texto: f.texto.slice(row.fonte.inicio, row.fonte.fim),
            }));
      const checked = validateRowEvidence(row, slices);
      if (!legacy && JSON.stringify(checked.fonte) !== JSON.stringify(row.fonte)) {
        throw new Error('Fonte divergente');
      }
      row.fonte = checked.fonte;
    }
    if (
      !data.tem_tabela_itens &&
      (data.itens_solicitados.length || data.resultado_lotes.length || data.resultado_global)
    ) {
      throw new Error('Tabela contraditoria');
    }
    return { valid: true, legacy, reason: null, data };
  } catch {
    return { valid: false, reason: 'evidencia_exige_revisao' };
  }
}

module.exports = {
  normalize,
  numericEvidence,
  validateRowEvidence,
  validateLeafEvidence,
  completeCoverage,
  assessItemsResult,
};
