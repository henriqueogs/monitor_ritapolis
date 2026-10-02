'use strict';

function splitTitle(source) {
  const text = String(source || '').trim();
  const parts = text.split(/\s+[-–—]\s+/).map(p => p.trim()).filter(Boolean);
  if (parts.length <= 1) return { titulo: text, subtitulo: null };
  const last = parts[parts.length - 1];
  // Um órgão no final identifica a origem, não o assunto do documento.
  if (/^(prefeitura(?: municipal)?|c[aâ]mara(?: municipal)?)(?: de)? rit[aá]polis$/i.test(last)) {
    return { titulo: parts.slice(0, -1).join(' – '), subtitulo: last };
  }
  return { titulo: last, subtitulo: parts.slice(0, -1).join(' – ') };
}

module.exports = { splitTitle };
