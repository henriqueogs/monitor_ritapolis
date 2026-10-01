'use strict';

const { buildItensProcessoPrompt } = require('./prompts/itens-processo-prompt');
const { validateItensProcessoStrict, MAX_LINHAS } = require('./contracts/itens-processo-contract');
const { validateLeafEvidence, completeCoverage } = require('./itens-processo-evidence');
const {
  CONTRACT_VERSION,
  digest,
  computeSourcesHash,
  sourceManifest,
} = require('./itens-processo-input');
const CHUNK_CHARS = 10000;
const OVERLAP_CHARS = 700;

function planChunks(fontes) {
  const chunks = [];
  let group = [],
    size = 0;
  for (const source of fontes) {
    if (!source.texto.trim()) {
      throw new Error(`Itens: fonte ${source.chave} sem texto; cobertura incompleta`);
    }
    for (let inicio = 0; inicio < source.texto.length; ) {
      let fim = Math.min(inicio + CHUNK_CHARS, source.texto.length);
      if (fim < source.texto.length) {
        const lineEnd = source.texto.lastIndexOf('\n', fim - 1) + 1;
        if (lineEnd > inicio + CHUNK_CHARS / 2) {
          fim = lineEnd;
        }
      }
      const slice = { ...source, inicio, fim, texto: source.texto.slice(inicio, fim) };
      if (size + slice.texto.length > CHUNK_CHARS && group.length) {
        chunks.push(group);
        group = [];
        size = 0;
      }
      group.push(slice);
      size += slice.texto.length;
      if (fim === source.texto.length) {
        break;
      }
      const next = fim - OVERLAP_CHARS;
      const lineStart = source.texto.lastIndexOf('\n', next - 1) + 1;
      inicio = lineStart > inicio ? lineStart : next;
    }
  }
  if (group.length) {
    chunks.push(group);
  }
  return chunks;
}

function parseJson(raw) {
  const text = String(raw || '').trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{'),
      end = text.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw new SyntaxError('Itens: resposta sem JSON valido');
    }
    return JSON.parse(text.slice(start, end + 1));
  }
}

function splitGroup(group) {
  if (group.length > 1) {
    const middle = Math.ceil(group.length / 2);
    return [group.slice(0, middle), group.slice(middle)];
  }
  const source = group[0];
  if (source.texto.length <= 1500) {
    return null;
  }
  const middle = Math.floor(source.texto.length / 2);
  const overlap = Math.min(OVERLAP_CHARS, Math.floor(middle / 3));
  const leftBoundary = source.texto.lastIndexOf('\n', middle + overlap - 1) + 1;
  const rightBoundary = source.texto.lastIndexOf('\n', middle - overlap - 1) + 1;
  const leftEnd = leftBoundary > middle ? leftBoundary : middle + overlap;
  const rightStart = rightBoundary > 0 ? rightBoundary : middle - overlap;
  return [
    [
      {
        ...source,
        fim: source.inicio + leftEnd,
        texto: source.texto.slice(0, leftEnd),
      },
    ],
    [
      {
        ...source,
        inicio: source.inicio + rightStart,
        texto: source.texto.slice(rightStart),
      },
    ],
  ];
}

function canonicalRow(row) {
  const { fonte, fonte_chave, trecho_fonte, ...data } = row;
  void fonte_chave;
  void trecho_fonte;
  return JSON.stringify({ chave: fonte?.chave, ...data });
}

function mergeLeaves(leaves, fontes) {
  const merged = {
    tem_tabela_itens: leaves.some(l => l.data.tem_tabela_itens),
    itens_solicitados: [],
    resultado_lotes: [],
    resultado_global: null,
    lacunas: [],
    confianca: 1,
  };
  const seen = new Set(),
    identities = new Map();
  for (const leaf of leaves) {
    merged.confianca = Math.min(merged.confianca, leaf.data.confianca);
    for (const field of ['itens_solicitados', 'resultado_lotes']) {
      for (const row of leaf.data[field]) {
        const key = `${field}:${canonicalRow(row)}`;
        if (seen.has(key)) {
          continue;
        }
        const id = field === 'itens_solicitados' ? row.item_numero : row.lote_numero;
        if (id !== null && id !== undefined) {
          const identity = `${field}:${row.fonte.chave}:${row.lote_numero ?? ''}:${id}`;
          if (identities.has(identity) && identities.get(identity) !== key) {
            throw new Error('Itens: linhas contraditorias para a mesma identidade; exige revisao');
          }
          identities.set(identity, key);
        }
        seen.add(key);
        merged[field].push(row);
      }
    }
    if (leaf.data.resultado_global) {
      if (
        merged.resultado_global &&
        canonicalRow(merged.resultado_global) !== canonicalRow(leaf.data.resultado_global)
      ) {
        throw new Error('Itens: mais de um resultado global; exige revisao por fonte');
      }
      merged.resultado_global = leaf.data.resultado_global;
    }
    merged.lacunas.push(...leaf.data.lacunas);
  }
  merged.lacunas = [...new Set(merged.lacunas)];
  const result = validateItensProcessoStrict(merged, { full: true });
  result.cobertura_fontes = {
    versao: CONTRACT_VERSION,
    fontes_hash: computeSourcesHash(fontes),
    fontes: sourceManifest(fontes),
    trechos: leaves.flatMap(l => l.intervals),
    leitura_integral: true,
    semantica: 'extracao_automatizada_com_citacao_validada',
  };
  if (!completeCoverage(result.cobertura_fontes, fontes)) {
    throw new Error('Itens: cobertura incompleta');
  }
  return result;
}

async function extractAllItems(documento, fontes, provider, progress) {
  const input = computeSourcesHash(fontes);
  async function extract(group) {
    const intervals = group.map(({ chave, inicio, fim }) => ({ chave, inicio, fim }));
    const key = `itens:${CONTRACT_VERSION}:${input}:${digest(JSON.stringify(intervals))}`;
    const cached = progress?.load(key);
    if (cached?.data) {
      return [
        { data: validateLeafEvidence(validateItensProcessoStrict(cached.data), group), intervals },
      ];
    }
    progress?.checkTime();
    const split = splitGroup(group);
    if (cached?.split && split) {
      return [...(await extract(split[0])), ...(await extract(split[1]))];
    }
    let data;
    try {
      const raw = await provider.generateJson({
        prompt: buildItensProcessoPrompt({ documento, trechos: group }),
        temperature: 0.1,
        timeoutMs: Math.min(120000, progress?.remainingMs() || 120000),
        maxRetries: 0,
      });
      data = validateItensProcessoStrict(parseJson(raw));
      if (
        data.itens_solicitados.length >= MAX_LINHAS ||
        data.resultado_lotes.length >= MAX_LINHAS
      ) {
        throw new SyntaxError('Itens: possivel limite de linhas atingido');
      }
    } catch (error) {
      if (error.code === 'PIPELINE_YIELD') {
        throw error;
      }
      const recoverable =
        error instanceof SyntaxError ||
        (error.name === 'ZodError' &&
          error.issues?.some(
            i => i.code === 'too_big' && (i.type === 'array' || i.origin === 'array')
          )) ||
        /timeout|timed out|context length|maximum context/i.test(error.message);
      if (!split || !recoverable) {
        throw error;
      }
      progress?.save(key, { split: true });
      return [...(await extract(split[0])), ...(await extract(split[1]))];
    }
    data = validateLeafEvidence(data, group);
    progress?.save(key, { data });
    return [{ data, intervals }];
  }
  const leaves = [];
  for (const group of planChunks(fontes)) {
    leaves.push(...(await extract(group)));
  }
  return mergeLeaves(leaves, fontes);
}

module.exports = {
  CHUNK_CHARS,
  OVERLAP_CHARS,
  planChunks,
  splitGroup,
  mergeLeaves,
  extractAllItems,
};
