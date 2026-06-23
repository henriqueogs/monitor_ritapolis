function extractFirst(text, regex) {
  const match = text.match(regex);
  return match?.[1]?.trim() || null;
}

function parseDecreto(text) {
  const source = text || '';
  return {
    numero: extractFirst(source, /decreto\s+n[º°o]?\s*([\d./-]+)/i),
    data: extractFirst(source, /(?:de|em)\s+(\d{2}\s+de\s+\w+\s+de\s+\d{4})/i),
    ementa: extractFirst(source, /ementa[:\s-]+(.+?)(?:\n{2,}|art\.?\s*1)/is),
    autoridade: extractFirst(source, /\b(prefeit[oa]\s+municipal\s+de\s+rit[aá]polis)\b/i)
  };
}

module.exports = {
  parseDecreto
};
