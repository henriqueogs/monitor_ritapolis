const HEADER_FOOTER_PATTERN =
  /\b1854\s+1963\s+Prefeitura\s+Municipal\s+de\s+Rit\S*polis\s+Pra\S*a\s+Tiradentes,\s*340\s+[-–]\s+Centro\s+[-–]\s+CEP\s+36335-000\s+CNPJ:\s*18\.557\.553\/0001-05\s+[-–]\s+Tel\.\s*\(32\)\s*3356-1136\b/gi;

const TABLE_HEADER_PATTERN =
  /\b(?:ITEM\s+UNI\s+QUANT|Item\s+Unid\s+Quant\.?)\s+Especifica\S*o\b/gi;

const ANNEX_WITH_TABLE_HEADER_PATTERN =
  /\bAnexo\s+[IVXLCDM]+\s+[-–]\s+[\s\S]*?\bItem\s+Unid\s+Quant\.?\s+Especifica\S*o\b/gi;
const ANNEX_TRAILING_PATTERN =
  /\bAnexo\s+[IVXLCDM]+\s+[-–]\s+[^0-9]*$/gi;

const UNIT_PATTERN = [
  'Embal\\s*agem\\s+de\\s+\\d+(?:[,.]\\d+)?\\s*(?:kg|gr|g|ml)?',
  'Pacote\\s+de\\s+\\d+(?:[,.]\\d+)?\\s*(?:kg|gr|g|ml)',
  'Pacote\\s+\\d+(?:[,.]\\d+)?\\s*(?:kg|gr|g|ml)\\.?',
  'Pct\\s+de\\s+\\d+(?:[,.]\\d+)?\\s*kg',
  'Sache\\s+de\\s+\\d+(?:[,.]\\d+)?\\s*(?:gr|g)',
  'Caixa\\s+de\\s+\\d+(?:[,.]\\d+)?\\s*grama\\s*s?',
  'Caixa\\s+\\d+(?:[,.]\\d+)?\\s*kg\\.?',
  'Unida\\s+de\\s+\\d+(?:[,.]\\d+)?\\s*(?:kg|gr|g|ml)\\.?',
  'Pote\\s+de\\s+\\d+(?:[,.]\\d+)?\\s*(?:kg|grama\\s*s?)',
  'Balde\\s+com\\s+\\d+(?:[,.]\\d+)?\\s*kg',
  'Lata\\s+de\\s+\\d+(?:[,.]\\d+)?\\s*(?:kg|gr|g)',
  'Lata\\s+de\\s+\\d+(?:[,.]\\d+)?\\s*grama\\s*s?',
  'Lata\\s+\\d+(?:[,.]\\d+)?\\s*(?:kg|gr)',
  'Frasco\\s+de\\s+\\d+(?:[,.]\\d+)?\\s*ml',
  'Garraf\\s*a\\s+de\\s+\\d+(?:[,.]\\d+)?\\s*ml',
  '\\d+(?:[,.]\\d+)?\\s+grama\\s*s?',
  'Unida\\s+de',
  'Unida',
  'Unid\\.?',
  'Kg',
  'kg',
  'Ma\\S*o',
  'Molho',
  'Pacote',
  'Caixa',
  'Lata',
  'Litro',
  'Fardo',
  'Pote',
  'D\\S*zia'
].join('|');

const UNIT_START_RE = new RegExp(
  `^(${UNIT_PATTERN})\\s+(\\d+(?:[,.]\\d+)?)\\s+([\\s\\S]+)$`,
  'i'
);

const UNIT_INSIDE_RE = new RegExp(
  `^([\\s\\S]+?)\\s+(${UNIT_PATTERN})\\s+(\\d+(?:[,.]\\d+)?)\\s+([\\s\\S]+)$`,
  'i'
);

function compactText(value, maxLength = 900) {
  const text = String(value || '')
    .replace(/\r/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) {return null;}
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

function normalizeUnit(value) {
  const text = compactText(value, 120);
  if (!text) {return null;}

  return text
    .replace(/Embal\s*agem/gi, 'Embalagem')
    .replace(/Garraf\s*a/gi, 'Garrafa')
    .replace(/\bUnida\s+de\b/gi, 'Unidade')
    .replace(/\bUnida\b/gi, 'Unidade')
    .replace(/\bkg\b/g, 'Kg')
    .replace(/\bKG\b/g, 'Kg')
    .replace(/grama\s+s/gi, 'gramas')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumber(value) {
  if (value === null || value === '') {return null;}
  const text = String(value)
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function removeTableNoise(value) {
  return String(value || '')
    .replace(HEADER_FOOTER_PATTERN, ' ')
    .replace(ANNEX_WITH_TABLE_HEADER_PATTERN, ' ')
    .replace(ANNEX_TRAILING_PATTERN, ' ')
    .replace(TABLE_HEADER_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTableRegion(text) {
  const source = String(text || '');
  const startMatch = source.match(TABLE_HEADER_PATTERN);
  if (!startMatch) {return null;}

  const start = source.search(TABLE_HEADER_PATTERN);
  if (start < 0) {return null;}

  const afterStart = source.slice(start);
  const endMatch = afterStart.search(/\b2\.\s+DA\s+JUSTIFICATIVA\b/i);
  const end = endMatch >= 0 ? start + endMatch : source.length;

  return source.slice(start, end);
}

function splitItemSegments(region) {
  const itemRe = /(?:^|\s)(\d{1,4})\.\s+/g;
  const markers = [];
  let match;

  while ((match = itemRe.exec(region))) {
    const itemNumber = Number(match[1]);
    if (!Number.isInteger(itemNumber) || itemNumber < 1) {continue;}
    markers.push({
      item_numero: String(itemNumber),
      start: match.index,
      contentStart: itemRe.lastIndex
    });
  }

  return markers.map((marker, index) => ({
    item_numero: marker.item_numero,
    texto: region.slice(marker.contentStart, markers[index + 1]?.start ?? region.length)
  }));
}

function parseItemSegment(segment) {
  const textoLimpo = removeTableNoise(segment.texto);
  if (!textoLimpo) {return null;}

  let match = textoLimpo.match(UNIT_START_RE);
  let unidade;
  let quantidade;
  let descricao;

  if (match) {
    unidade = match[1];
    quantidade = match[2];
    descricao = match[3];
  } else {
    match = textoLimpo.match(UNIT_INSIDE_RE);
    if (!match) {return null;}

    unidade = match[2];
    quantidade = match[3];
    descricao = `${match[1]} ${match[4]}`;
  }

  const parsedQuantidade = parseNumber(quantidade);
  const parsedDescricao = compactText(descricao);
  const parsedTrechoFonte = compactText(`${segment.item_numero}. ${textoLimpo}`);

  if (!parsedQuantidade || !parsedDescricao || parsedDescricao.length < 3 || !parsedTrechoFonte) {
    return null;
  }

  return {
    item_numero: segment.item_numero,
    lote_numero: null,
    descricao: parsedDescricao,
    unidade: normalizeUnit(unidade),
    quantidade: parsedQuantidade,
    valor_unitario_estimado: null,
    valor_total_estimado: null,
    valor_unitario_final: null,
    valor_total_final: null,
    fornecedor_nome: null,
    fornecedor_cnpj: null,
    origem: 'texto_tabela',
    origem_detalhe: 'texto_completo:tabela_itens',
    trecho_fonte: parsedTrechoFonte,
    resumo_ai_id: null,
    confianca: 0.86,
    status_revisao: 'pendente'
  };
}

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSpreadsheetLine(line) {
  const match = String(line || '').match(/^LINHA\s+\d+\s*\|\s*(.+)$/i);
  if (!match) {return null;}

  return match[1]
    .split(/\s+\|\s+/)
    .map((cell) => cell.trim());
}

function findColumn(headers, patterns) {
  return headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
}

function getSpreadsheetHeader(cells) {
  const headers = cells.map(normalizeHeader);
  const item = findColumn(headers, [/^item$/, /^it$/, /^codigo$/, /^cod$/]);
  const descricao = findColumn(headers, [
    /descricao/,
    /especificacao/,
    /discriminacao/,
    /produto/,
    /material/,
    /servico/,
    /objeto/,
    /insumo/
  ]);
  const unidade = findColumn(headers, [/^unid/, /^und$/, /^un$/, /unidade/]);
  const quantidade = findColumn(headers, [/^quant/, /^qtd/, /quantidade/]);
  const valorUnitario = findColumn(headers, [/unitario/, /vlr unit/, /valor unit/]);
  const valorTotal = findColumn(headers, [/total/, /valor global/, /vlr total/]);

  if (descricao < 0) {return null;}

  const score = [item, unidade, quantidade, valorUnitario, valorTotal].filter((idx) => idx >= 0).length;
  if (score < 2) {return null;}

  return { item, descricao, unidade, quantidade, valorUnitario, valorTotal };
}

function looksLikeHeader(cells) {
  return Boolean(getSpreadsheetHeader(cells));
}

function getCell(cells, index) {
  return index >= 0 ? cells[index] : null;
}

function parseSpreadsheetRows(text) {
  if (!String(text || '').includes('[PLANILHA')) {return [];}

  const rows = String(text)
    .split(/\n+/)
    .map(parseSpreadsheetLine)
    .filter(Boolean);
  const produtos = [];
  let header = null;

  for (const cells of rows) {
    const candidate = getSpreadsheetHeader(cells);
    if (candidate) {
      header = candidate;
      continue;
    }

    if (!header || looksLikeHeader(cells)) {continue;}

    const descricao = compactText(getCell(cells, header.descricao), 900);
    if (!descricao || descricao.length < 4 || /^\d+(?:[,.]\d+)?$/.test(descricao)) {continue;}

    const itemRaw = getCell(cells, header.item);
    const itemNumero = parseNumber(itemRaw) || produtos.length + 1;
    const quantidade = parseNumber(getCell(cells, header.quantidade));
    const unidade = normalizeUnit(getCell(cells, header.unidade));
    const valorUnitario = parseNumber(getCell(cells, header.valorUnitario));
    const valorTotal = parseNumber(getCell(cells, header.valorTotal));

    if (!quantidade && !valorUnitario && !valorTotal && !unidade) {continue;}

    produtos.push({
      item_numero: String(Math.trunc(itemNumero)),
      lote_numero: null,
      descricao,
      unidade,
      quantidade,
      valor_unitario_estimado: valorUnitario,
      valor_total_estimado: valorTotal,
      valor_unitario_final: null,
      valor_total_final: null,
      fornecedor_nome: null,
      fornecedor_cnpj: null,
      origem: 'planilha',
      origem_detalhe: 'documentos_anexos:planilha',
      trecho_fonte: compactText(cells.join(' | '), 900),
      resumo_ai_id: null,
      confianca: 0.88,
      status_revisao: 'pendente'
    });
  }

  return produtos;
}

function parseProdutosLicitados(text) {
  const planilha = parseSpreadsheetRows(text);
  if (planilha.length) {return planilha;}

  const region = getTableRegion(text);
  if (!region) {return [];}

  return splitItemSegments(removeTableNoise(region))
    .map(parseItemSegment)
    .filter(Boolean);
}

module.exports = {
  parseProdutosLicitados
};
