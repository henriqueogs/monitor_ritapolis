const PREFEITURA_HEADER_PATTERN =
  /\b1854\s+1963\s+Prefeitura\s+Municipal\s+de\s+Rit\S*polis\s+Pra\S*a\s+Tiradentes,\s*340\s+[-–]\s+Centro\s+[-–]\s+CEP\s+36335-000\s+CNPJ:\s*18\.557\.553\/0001-05\s+[-–]\s+Tel\.\s*\(32\)\s*3356-1136\s+\d*\b/gi;

const CNPJ_PREFEITURA = '18.557.553/0001-05';
const MONEY_RE = 'R\\$\\s*([\\d.]+,\\d{2})';
const MONEY_OPTIONAL_SYMBOL_RE = '(?:R\\$\\s*)?([\\d.]+,\\d{2,4})';

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
    2000000
  ) || '';
}

function parseMoney(value) {
  const parsed = Number(String(value || '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatMoneySource(value) {
  const text = String(value || '').trim();
  return text.startsWith('R$') ? text : `R$ ${text}`;
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
    .replace(/\s+\w?\]\s*$/g, '')
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
  const end = endMatch && endMatch.index !== undefined
    ? startMatch.index + startMatch[0].length + endMatch.index
    : clean.length;

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
      tipo === 'negociacao' ? 'NEGOCIACAO' : tipo === 'resultado' ? 'RESULTADO' : 'CLASSIFICACAO',
      `Item ${itemNumero}`,
      descricao,
      fornecedor ? `Fornecedor ${fornecedor}` : null,
      valorFinal ? `Valor final ${formatMoneySource(valorFinal)}` : null
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

function parseResultadoDeclarado(text, cnpjMap) {
  const section = findSection(
    text,
    /\bRESULTADO\b/i,
    /\b(?:ENCERRAMENTO|ASSINAM|RECURSOS|OCORR\S*NCIAS)\b/i
  );

  if (!section) {return [];}

  const clean = removeAtaNoise(section);
  const markerRe = /\b(\d{1,4})\s*[-–]\s*/g;
  const resultados = [];
  let match;
  const markers = [];

  while ((match = markerRe.exec(clean))) {
    markers.push({ numero: String(Number(match[1])), start: match.index, contentStart: markerRe.lastIndex });
  }

  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const segment = clean.slice(marker.contentStart, markers[index + 1]?.start ?? clean.length);
    if (!/\b[VN]ence\w*/i.test(segment)) {continue;}

    const moneyMatch = segment.match(new RegExp(MONEY_RE, 'i'));
    if (!moneyMatch) {continue;}

    const beforeMoney = segment.slice(0, moneyMatch.index).replace(/\s*\|\s*/g, ' | ').trim();
    const parts = beforeMoney
      .split(/\s*(?:\||\.)\s*/)
      .map((part) => part.trim())
      .filter(Boolean);
    const descricao = compactText(parts.shift(), 500);
    const fornecedorNome = cleanFornecedorNome(parts.join(' ') || beforeMoney);
    const valorFinal = parseMoney(moneyMatch[1]);
    if (!fornecedorNome || !valorFinal || !descricao) {continue;}

    resultados.push({
      item_numero: marker.numero,
      descricao,
      valor_unitario_final: valorFinal,
      valor_total_final: null,
      valor_final_tipo: inferValorFinalTipo(descricao),
      fornecedor_nome: fornecedorNome,
      fornecedor_cnpj: findFornecedorCnpj(cnpjMap, fornecedorNome),
      origem: 'ata_resultado',
      origem_detalhe: 'ata:resultado_declarado',
      trecho_fonte: buildTrechoFonte(marker.numero, descricao, fornecedorNome, moneyMatch[1], 'resultado'),
      confianca: 0.86
    });
  }

  return resultados;
}

function splitPlataformaSegments(text) {
  const clean = removeAtaNoise(text);
  const markerRe = /\b(Item|Lote)\s+(\d{1,4})\s*(?:[-–]\s*([\s\S]{0,220}?))?\s+Status:\s*([A-Za-zÀ-ÿ]+)/gi;
  const markers = [];
  let match;

  while ((match = markerRe.exec(clean))) {
    markers.push({
      tipo: normalizeKey(match[1]),
      numero: String(Number(match[2])),
      titulo: compactText(match[3] || '', 220),
      status: normalizeKey(match[4]),
      start: match.index,
      contentStart: markerRe.lastIndex
    });
  }

  return markers.map((marker, index) => ({
    ...marker,
    texto: clean.slice(marker.contentStart, markers[index + 1]?.start ?? clean.length)
  }));
}

function parsePlataformaEletronicaSegment(segment, cnpjMap) {
  if (segment.status && segment.status !== 'aprovado') {return null;}

  const rowRe = new RegExp(
    `1\\s*[°º]\\s+([A-ZÀ-Ú0-9][A-ZÀ-Ú0-9\\s.&'/-]{3,180}?)\\s+(\\d{11,14})\\s+${MONEY_OPTIONAL_SYMBOL_RE}\\s+Vencedor`,
    'i'
  );
  const match = segment.texto.match(rowRe);
  if (!match) {return null;}

  const descricaoMatch = segment.texto.match(/Descri\S*o\s+complementar:\s*([\s\S]{2,700}?)(?:\s+Quantidade:|\s+Estimado:|\s+Unidade\s+de\s+medida:)/i);
  const descricao = compactText(segment.titulo || descricaoMatch?.[1], 500);
  const fornecedorNome = cleanFornecedorNome(match[1]);
  const valorFinal = parseMoney(match[3]);

  if (!descricao || !fornecedorNome || !valorFinal) {return null;}

  const isLote = segment.tipo === 'lote';
  return {
    item_numero: segment.numero,
    lote_numero: isLote ? segment.numero : null,
    descricao,
    valor_unitario_final: valorFinal,
    valor_total_final: null,
    valor_final_tipo: isLote ? 'lote' : inferValorFinalTipo(descricao),
    fornecedor_nome: fornecedorNome,
    fornecedor_cnpj: match[2] || findFornecedorCnpj(cnpjMap, fornecedorNome),
    origem: 'ata_resultado',
    origem_detalhe: isLote ? 'ata:plataforma_eletronica_lote' : 'ata:plataforma_eletronica_item',
    trecho_fonte: buildTrechoFonte(segment.numero, descricao, fornecedorNome, match[3], 'classificacao'),
    confianca: isLote ? 0.84 : 0.9
  };
}

function parsePlataformaEletronica(text, cnpjMap) {
  return splitPlataformaSegments(text)
    .map((segment) => parsePlataformaEletronicaSegment(segment, cnpjMap))
    .filter(Boolean);
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
  const plataforma = parsePlataformaEletronica(text, cnpjMap);
  if (plataforma.length) {return plataforma;}

  const byItem = new Map();
  const addResults = (rows) => {
    for (const row of rows) {
      if (!row?.item_numero) {continue;}
      const key = String(Number(row.item_numero));
      if (!byItem.has(key)) {
        byItem.set(key, row);
      }
    }
  };

  addResults(parseNegociacao(text, cnpjMap));
  addResults(parseClassificacao(text, cnpjMap));
  addResults(parseResultadoDeclarado(text, cnpjMap));

  if (byItem.size) {return Array.from(byItem.values());}

  const negociacao = parseNegociacao(text, cnpjMap);
  if (negociacao.length) {return negociacao;}

  const classificacao = parseClassificacao(text, cnpjMap);
  if (classificacao.length) {return classificacao;}

  return parseResultadoDeclarado(text, cnpjMap);
}

module.exports = {
  parseResultadosItensLicitacao
};
