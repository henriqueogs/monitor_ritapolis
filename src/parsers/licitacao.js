function parseCurrency(value) {
  if (!value) return null;
  const normalized = value.replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractFirst(text, regex) {
  const match = text.match(regex);
  return match?.[1]?.trim() || null;
}

function parseLicitacao(text) {
  const source = text || '';
  const modalidade = extractFirst(
    source,
    /\b(preg[aã]o(?:\s+eletr[oô]nico|\s+presencial)?|dispensa|inexigibilidade|concorr[eê]ncia|tomada de pre[cç]os)\b/i
  );
  const numero_processo = extractFirst(
    source,
    /processo\s+(?:licitat[oó]rio\s*)?(?:n[º°o]\s*)?[:\-]?\s*([\d./-]+)/i
  );
  const data_abertura = extractFirst(
    source,
    /(?:data\s+de\s+abertura|abertura)[:\s\-]+(\d{2}\/\d{2}\/\d{4})/i
  );
  const valorBruto = extractFirst(
    source,
    /valor\s+(?:estimado|global|total)[:\s\-]+R\$\s*([\d.]+,\d{2})/i
  );
  const objeto = extractFirst(
    source,
    /objeto[:\s\-]+(.+?)(?:\n{2,}|\n[A-Z][^\n]*:|valor\s+estimado|data\s+de\s+abertura)/is
  );

  const foundCount = [modalidade, numero_processo, data_abertura, valorBruto, objeto].filter(Boolean).length;

  return {
    modalidade,
    numero_processo,
    data_abertura,
    valor_estimado: parseCurrency(valorBruto),
    objeto,
    confianca: Number((foundCount / 5).toFixed(2))
  };
}

module.exports = {
  parseLicitacao
};
