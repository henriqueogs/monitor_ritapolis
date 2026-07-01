const PREFEITURA_CNPJ = '18.557.553/0001-05';

const MONTHS = {
  janeiro: '01',
  fevereiro: '02',
  marco: '03',
  abril: '04',
  maio: '05',
  junho: '06',
  julho: '07',
  agosto: '08',
  setembro: '09',
  outubro: '10',
  novembro: '11',
  dezembro: '12'
};

function compactText(value, maxLength = 900) {
  const text = String(value || '')
    .replace(/\r/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) {return null;}
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function parseCurrency(value) {
  if (!value) {return null;}
  const parsed = Number(String(value).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCnpj(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 14) {return null;}
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function cleanName(value) {
  const text = compactText(value, 180);
  if (!text) {return null;}

  return text
    .replace(/^(?:a\s+)?empresa\s+/i, '')
    .replace(/^contratada\s*:?\s*/i, '')
    .replace(/\s*(?:,|-)?\s*CNPJ\s*(?:n[ºo]\s*)?$/i, '')
    .replace(/\s*,?\s*(?:inscrita|inscrito)\s+no\s+cnpj.*$/i, '')
    .replace(/\s*,?\s*neste\s+ato.*$/i, '')
    .replace(/\s*,?\s*doravante.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:–-]+$/g, '')
    .trim();
}

function isMunicipalityName(value) {
  const normalized = normalizeKey(value);
  return normalized.includes('prefeitura municipal') ||
    normalized.includes('municipio de ritapolis') ||
    normalized.includes('municipal de ritapolis');
}

function isInvalidFornecedorName(value) {
  const normalized = normalizeKey(value);
  return !normalized ||
    normalized === 'cnpj' ||
    normalized === 'cnpj no' ||
    normalized === 'de natureza publica' ||
    normalized.includes('pessoa juridica de direito publico');
}

function getDistinctCnpjs(text) {
  const matches = String(text || '').match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\s*\d{2}/g) || [];
  return [...new Set(matches.map(normalizeCnpj).filter(Boolean))];
}

function getContext(text, index, length = 0, radius = 320) {
  if (index < 0) {return null;}
  return compactText(String(text || '').slice(Math.max(0, index - radius), index + length + radius));
}

function inferOrigem({ text, anexos }) {
  const anexoText = anexos.map((anexo) => anexo.nome || '').join(' ');
  const normalizedAnexos = normalizeKey(anexoText);
  const normalizedText = normalizeKey(text);

  if (normalizedAnexos.includes('contrato') || normalizedAnexos.includes('contratacao')) {return 'texto_contrato';}
  if (normalizedAnexos.includes('ata')) {return 'texto_ata';}
  if (normalizedAnexos.includes('homolog')) {return 'texto_homologacao';}
  if (normalizedAnexos.includes('extrato')) {return 'texto_extrato';}

  if (normalizedText.includes('edital de credenciamento') || normalizedText.includes('edital do pregao')) {
    return 'texto_documento';
  }
  if (normalizedText.includes('contrato') || normalizedText.includes('contratacao')) {return 'texto_contrato';}
  if (normalizedText.includes('ata')) {return 'texto_ata';}
  if (normalizedText.includes('homolog')) {return 'texto_homologacao';}
  return 'texto_documento';
}

function parseFornecedor(text, cnpjs) {
  const source = String(text || '');
  const patterns = [
    /Empresa\s+contratada\s*:\s*([^.,;]+(?:\s+[^,.;]+){0,12}?)\s*,?\s*(?:inscrita|inscrito)\s+no\s+CNPJ(?:\s+sob\s+o)?\s*(?:n[ºo]\s*)?([0-9.\-/\s]{14,24})/i,
    /\be\s+a\s+empresa\s+([^,\n]{3,180}?)\s*,?\s*(?:inscrita|inscrito)\s+no\s+CNPJ(?:\s+sob\s+o)?\s*(?:n[ºo]\s*)?([0-9.\-/\s]{14,24})/i,
    /\be\s+a\s+empresa\s+([^,\n]{3,180}?)\s*(?:,|-)?\s*CNPJ\s*(?:n[ºo]\s*)?([0-9.\-/\s]{14,24})/i,
    /\ba\s+empresa\s+([^,\n]{3,180}?)\s*(?:,|-)?\s*CNPJ\s*(?:n[ºo]\s*)?([0-9.\-/\s]{14,24})/i,
    /\be\s+o\s+(Cons[oó]rcio[^,\n]{3,220}?)\s*,[^.]{0,260}?inscrit[oa]\s+no\s+CNPJ(?:\s+sob\s+o)?\s*(?:n[ºo]\s*)?([0-9.\-/\s]{14,24})/i,
    /\be\s+o\s+([^,\n]{3,220}?)\s*,\s*(?:com\s+endere[cç]o[^.]{0,240}?)?inscrit[oa]\s+no\s+CNPJ\s*(?:n[ºo]\s*)?([0-9.\-/\s]{14,24})/i,
    /\b([A-ZÁÀÂÃÉÈÊÍÓÔÕÚÜÇ0-9][^,\n]{3,180}?)\s*,\s*(?:inscrita|inscrito)\s+no\s+CNPJ(?:\s+sob\s+o)?\s*(?:n[ºo]\s*)?([0-9.\-/\s]{14,24})/i
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) {continue;}

    const nome = cleanName(match[1]);
    const cnpj = normalizeCnpj(match[2]);
    if (!nome || !cnpj || cnpj === PREFEITURA_CNPJ || isMunicipalityName(nome) || isInvalidFornecedorName(nome)) {continue;}

    const index = match.index || source.indexOf(match[0]);
    return {
      nome,
      cnpj,
      trecho: getContext(source, index, match[0].length)
    };
  }

  const nonMunicipalityCnpjs = cnpjs.filter((cnpj) => cnpj !== PREFEITURA_CNPJ);
  if (nonMunicipalityCnpjs.length !== 1) {return null;}

  const cnpj = nonMunicipalityCnpjs[0];
  const cnpjIndex = source.indexOf(cnpj);
  const looseIndex = cnpjIndex >= 0 ? cnpjIndex : source.search(new RegExp(cnpj.replace(/[./-]/g, '[.\\-/\\s]*')));
  if (looseIndex < 0) {return null;}

  const before = source.slice(Math.max(0, looseIndex - 180), looseIndex);
  const looseMatch = before.match(/(?:empresa|contratada|contratado)\s+([^.,;\n]{3,160})$/i) ||
    before.match(/([A-ZÁÀÂÃÉÈÊÍÓÔÕÚÜÇ0-9][^.,;\n]{3,160})$/);
  const nome = cleanName(looseMatch?.[1]);

  if (!nome || isMunicipalityName(nome) || isInvalidFornecedorName(nome)) {return null;}

  return {
    nome,
    cnpj,
    trecho: getContext(source, looseIndex, cnpj.length)
  };
}

function parseValorFinal(text, origem) {
  const source = String(text || '');
  const patterns = [
    /Valor\s+do\s+contrato\s*:?\s*R\$\s*([\d.]+,\d{2})/i,
    /contrata[cç][aã]o\s+tem\s+valor\s+total\s+de\s*R\$\s*([\d.]+,\d{2})/i,
    /valor\s+total\s+(?:de|do contrato de)?\s*R\$\s*([\d.]+,\d{2})/i,
    /valor\s+global\s*(?:[:–-]|\s+de)?\s*R\$\s*([\d.]+,\d{2})/i,
    /pre[cç]o\s+global\s*(?:[:–-]|\s+de)?\s*R\$\s*([\d.]+,\d{2})/i,
    /\banual\s+de\s*R\$\s*([\d.]+,\d{2})/i,
    /os\s+valores\s+(?:para\s+execu[cç][aã]o[^.]{0,120}?|[^.]{0,120}?)\s+s[aã]o\s+de\s*R\$\s*([\d.]+,\d{2})/i
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) {continue;}

    const valor = parseCurrency(match[1]);
    if (!valor || valor <= 0) {continue;}

    const index = match.index || source.indexOf(match[0]);
    const after = source.slice(index + match[0].length, index + match[0].length + 180);
    if (/\bpor\s+(?:ponto|unidade|km|m[eê]s|hora|item|servi[cç]o)\b/i.test(after)) {continue;}
    if (origem === 'texto_documento' && !/valor\s+do\s+contrato|contrata[cç][aã]o\s+tem\s+valor\s+total/i.test(match[0])) {
      continue;
    }

    return {
      valor,
      trecho: getContext(source, index, match[0].length)
    };
  }

  return null;
}

function parseHomologacaoDate(text) {
  const source = String(text || '');
  const homologIndex = normalizeKey(source).indexOf('homolog');
  if (homologIndex < 0) {return null;}

  const window = source.slice(Math.max(0, homologIndex - 500), homologIndex + 1200);
  const brDate = window.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (brDate) {return `${brDate[3]}-${brDate[2]}-${brDate[1]}`;}

  const extenso = window.match(/\b(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})\b/i);
  if (!extenso) {return null;}

  const month = MONTHS[normalizeKey(extenso[2])];
  if (!month) {return null;}
  return `${extenso[3]}-${month}-${String(extenso[1]).padStart(2, '0')}`;
}

function parseNumeroPncp(text) {
  const source = String(text || '');
  const patterns = [
    /(?:numero|n[Âºo.]?|controle|id)\s+(?:de\s+)?(?:controle\s+)?PNCP\s*:?\s*([0-9]{14}-\d-\d{5,8}\/20\d{2})/i,
    /PNCP\s*:?\s*([0-9]{14}-\d-\d{5,8}\/20\d{2})/i,
    /\b([0-9]{14}-\d-\d{5,8}\/20\d{2})\b/
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) {return match[1].trim();}
  }

  return null;
}

function parseLicitacaoDetalhes(text, { anexos = [] } = {}) {
  const source = compactText(text, 500000) || '';
  if (!source) {return null;}

  const cnpjs = getDistinctCnpjs(source);
  const origem = inferOrigem({ text: source, anexos });
  const nonMunicipalityCnpjs = cnpjs.filter((cnpj) => cnpj !== PREFEITURA_CNPJ);
  const multipleContracts = anexos.filter((anexo) => /contrato/i.test(anexo.nome || '')).length > 1;
  const shouldAvoidSingleWinner = multipleContracts && nonMunicipalityCnpjs.length > 1;
  const fornecedor = shouldAvoidSingleWinner ? null : parseFornecedor(source, cnpjs);
  const valorFinal = shouldAvoidSingleWinner ? null : parseValorFinal(source, origem);
  const dataHomologacao = origem === 'texto_documento' ? null : parseHomologacaoDate(source);
  const numeroPncp = parseNumeroPncp(source);
  const origemDetalhe = anexos
    .filter((anexo) => /contrato|extrato|ata|homolog/i.test(anexo.nome || ''))
    .map((anexo) => anexo.nome)
    .slice(0, 5)
    .join(' | ') || null;
  const trechoFonte = compactText([fornecedor?.trecho, valorFinal?.trecho].filter(Boolean).join(' '), 1200);

  if (!fornecedor && !valorFinal && !dataHomologacao && !numeroPncp) {return null;}

  const foundCount = [
    fornecedor?.nome,
    fornecedor?.cnpj,
    valorFinal?.valor,
    dataHomologacao,
    numeroPncp
  ].filter(Boolean).length;

  return {
    vencedor_nome: fornecedor?.nome || null,
    vencedor_cnpj: fornecedor?.cnpj || null,
    valor_final: valorFinal?.valor ?? null,
    numero_pncp: numeroPncp,
    data_homologacao: dataHomologacao || null,
    origem,
    origem_detalhe: origemDetalhe,
    trecho_fonte: trechoFonte,
    confianca: Number(Math.min(0.95, 0.45 + foundCount * 0.13).toFixed(2))
  };
}

module.exports = {
  parseLicitacaoDetalhes
};
