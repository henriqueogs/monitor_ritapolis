const PREFEITURA_HEADER_PATTERN =
  /\b1854\s+1963\s+Prefeitura\s+Municipal\s+de\s+Rit\S*polis\s+Pra\S*a\s+Tiradentes,\s*340\s+[-–]\s+Centro\s+[-–]\s+CEP\s+36335-000\s+CNPJ:\s*18\.557\.553\/0001-05\s+[-–]\s+Tel\.\s*\(32\)\s*3356-1136\s+\d*\b/gi;

const CNPJ_PREFEITURA = '18.557.553/0001-05';
const MONEY_RE = 'R\\$\\s*([\\d.]+,\\d{2})';

function compactText(value, maxLength = 1200) {
  const text = String(value || '')
    .replace(/\r/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) {return null;}
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

function stripDiacritics(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeKey(value) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function removeAtaNoise(value) {
  return compactText(
    String(value || '')
      .replace(PREFEITURA_HEADER_PATTERN, ' ')
      .replace(/\b1854\s+1963\b/g, ' ')
      .replace(/\s+/g, ' '),
    200000
  ) || '';
}

function parseMoney(value) {
  const parsed = Number(String(value || '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function cleanFornecedorNome(value) {
  const text = compactText(value, 180);
  if (!text) {return null;}

  return text
    .replace(/\bFornecedor\b/gi, ' ')
    .replace(/\bValor\b/gi, ' ')
    .replace(/\bClassifica\S*o\b/gi, ' ')
    .replace(/\bSitua\S*o\b/gi, ' ')
    .replace(/^.*\bDOCUMENTO\s+DO\s+REPRESENTANTE\s+/i, '')
    .replace(/^.*\bDOCUMENTO\s+DA\s+EMPRESA\s+/i, '')
    .replace(/^.*\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\s+/i, '')
    .replace(/^.*\b\d{3}\.\d{3}\.\d{3}-\d{2}(?:\s*-\s*[\d.]+)?\s+/i, '')
    .replace(/^\d+\s+/, '')
    .replace(/\s+/g, ' ')
    .trim() || null;
}

function parseFornecedorCnpjMap(text) {
  const clean = removeAtaNoise(text);
  const cnpjRe = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;
  const map = new Map();
  let match;

  while ((match = cnpjRe.exec(clean))) {
    const cnpj = match[0];
    if (cnpj === CNPJ_PREFEITURA) {continue;}

    const before = clean.slice(Math.max(0, match.index - 160), match.index);
    const nameMatch = before.match(/([A-ZÀ-Ú0-9][A-ZÀ-Ú0-9\s.&'/-]{3,130}?(?:LTDA|EIRELI|EPP|ME|S\/A|SA))\s*$/i);
    const nome = cleanFornecedorNome(nameMatch?.[1]) || cleanFornecedorNome(before);

    if (nome) {
      map.set(normalizeKey(nome), cnpj);
    }
  }

  return map;
}

function findFornecedorCnpj(cnpjMap, fornecedorNome) {
  const key = normalizeKey(fornecedorNome);
  if (cnpjMap.has(key)) {return cnpjMap.get(key);}

  for (const [candidate, cnpj] of cnpjMap.entries()) {
    if (candidate.includes(key) || key.includes(candidate)) {return cnpj;}
  }

  const raizMatch = String(fornecedorNome || '').match(/^\s*(\d{2}\.\d{3}\.\d{3})\b/);
  if (raizMatch) {
    for (const cnpj of cnpjMap.values()) {
      if (String(cnpj).startsWith(raizMatch[1])) {return cnpj;}
    }
  }

  return null;
}

function findSection(text, headingPattern, endPattern) {
  const clean = removeAtaNoise(text);
  const startMatch = clean.match(headingPattern);
  if (!startMatch || startMatch.index === null) {return null;}

  const afterStart = clean.slice(startMatch.index);
  const endMatch = endPattern ? afterStart.slice(startMatch[0].length).match(endPattern) : null;
  const end = endMatch?.index === null
    ? clean.length
    : startMatch.index + startMatch[0].length + endMatch.index;

  return clean.slice(startMatch.index, end);
}

function splitItemSegments(section) {
  const itemRe = /\bItem:\s*(\d{1,4})\s*[-–]\s*/gi;
  const markers = [];
  let match;

  while ((match = itemRe.exec(section))) {
    markers.push({
      item_numero: String(Number(match[1])),
      start: match.index,
      contentStart: itemRe.lastIndex
    });
  }

  return markers.map((marker, index) => ({
    item_numero: marker.item_numero,
    texto: section.slice(marker.contentStart, markers[index + 1]?.start ?? section.length)
  }));
}

function buildTrechoFonte(itemNumero, descricao, fornecedor, valorFinal, tipo) {
  return compactText(
    [
      tipo === 'negociacao' ? 'NEGOCIACAO' : 'CLASSIFICACAO',
      `Item ${itemNumero}`,
      descricao,
      fornecedor ? `Fornecedor ${fornecedor}` : null,
      valorFinal ? `Valor final R$ ${valorFinal}` : null
    ]
      .filter(Boolean)
      .join(' - '),
    900
  );
}

function inferValorFinalTipo(descricao) {
  const key = normalizeKey(descricao);
  if (!key) {return null;}
  if (/\bvalor global\b|\bglobal\b/.test(key)) {return 'global';}
  if (/\blote\b/.test(key)) {return 'lote';}
  return 'unitario';
}

function parseNegociacaoSegment(segment, cnpjMap) {
  const body = removeAtaNoise(segment.texto);
  const rowRe = new RegExp(
    `Fornecedor\\s+Valor\\s+Negociado\\s+Valor\\s+Vencedor\\s+Situa\\S*o\\s+([\\s\\S]+?)\\s+${MONEY_RE}\\s+${MONEY_RE}\\s+Vencedor`,
    'i'
  );
  const match = body.match(rowRe);
  if (!match) {return null;}

  const headerIndex = body.search(/Fornecedor\s+Valor\s+Negociado\s+Valor\s+Vencedor\s+Situa\S*o/i);
  const descricao = compactText(headerIndex >= 0 ? body.slice(0, headerIndex) : body, 500);
  const fornecedorNome = cleanFornecedorNome(match[1]);
  const valorFinal = parseMoney(match[3]);

  if (!descricao || !fornecedorNome || !valorFinal) {return null;}

  return {
    item_numero: segment.item_numero,
    descricao,
    valor_unitario_final: valorFinal,
    valor_total_final: null,
    valor_final_tipo: inferValorFinalTipo(descricao),
    fornecedor_nome: fornecedorNome,
    fornecedor_cnpj: findFornecedorCnpj(cnpjMap, fornecedorNome),
    origem: 'ata_resultado',
    origem_detalhe: 'ata:negociacao',
    trecho_fonte: buildTrechoFonte(segment.item_numero, descricao, fornecedorNome, match[3], 'negociacao'),
    confianca: 0.92
  };
}

function parseClassificacaoSegment(segment, cnpjMap) {
  const body = removeAtaNoise(segment.texto);
  const rowRe = new RegExp(
    `Fornecedor\\s+Valor\\s+Classifica\\S*o\\s+([\\s\\S]+?)\\s+${MONEY_RE}\\s+1\\D{0,8}-\\s*Lugar`,
    'i'
  );
  const match = body.match(rowRe);
  if (!match) {return null;}

  const headerIndex = body.search(/Fornecedor\s+Valor\s+Classifica\S*o/i);
  const descricao = compactText(headerIndex >= 0 ? body.slice(0, headerIndex) : body, 500);
  const fornecedorNome = cleanFornecedorNome(match[1]);
  const valorFinal = parseMoney(match[2]);

  if (!descricao || !fornecedorNome || !valorFinal) {return null;}

  return {
    item_numero: segment.item_numero,
    descricao,
    valor_unitario_final: valorFinal,
    valor_total_final: null,
    valor_final_tipo: inferValorFinalTipo(descricao),
    fornecedor_nome: fornecedorNome,
    fornecedor_cnpj: findFornecedorCnpj(cnpjMap, fornecedorNome),
    origem: 'ata_resultado',
    origem_detalhe: 'ata:classificacao',
    trecho_fonte: buildTrechoFonte(segment.item_numero, descricao, fornecedorNome, match[2], 'classificacao'),
    confianca: 0.88
  };
}

function parseNegociacao(text, cnpjMap) {
  const section = findSection(
    text,
    /\bNEGOCIA\S*O\b/i,
    /\b(?:HABILITA\S*O|RECURSOS|OCORR\S*NCIAS|ENCERRAMENTO|ASSINAM)\b/i
  );

  if (!section) {return [];}

  return splitItemSegments(section)
    .map((segment) => parseNegociacaoSegment(segment, cnpjMap))
    .filter(Boolean);
}

function parseClassificacao(text, cnpjMap) {
  const section = findSection(
    text,
    /\bCLASSIFICA\S*O\b/i,
    /\b(?:NEGOCIA\S*O|HABILITA\S*O|RECURSOS|OCORR\S*NCIAS|ENCERRAMENTO|ASSINAM)\b/i
  );

  if (!section) {return [];}

  return splitItemSegments(section)
    .map((segment) => parseClassificacaoSegment(segment, cnpjMap))
    .filter(Boolean);
}

function parseResultadosItensLicitacao(text) {
  const cnpjMap = parseFornecedorCnpjMap(text);
  const negociacao = parseNegociacao(text, cnpjMap);
  if (negociacao.length) {return negociacao;}

  return parseClassificacao(text, cnpjMap);
}

module.exports = {
  parseResultadosItensLicitacao
};
