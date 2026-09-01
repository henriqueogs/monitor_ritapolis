// Parseia o snippet retornado pelo FTS5 (src/db/fts-repo.js), que envolve os
// termos casados em `<mark>...</mark>` sem escapar o texto ao redor — texto
// esse extraído de PDFs/OCR de terceiros, não confiável para ir direto ao DOM
// via dangerouslySetInnerHTML. Aqui só reconhecemos a tag `<mark>` que nós
// mesmos pedimos ao SQLite; todo o resto vira texto puro (React escapa).
const MARK_RE = /<mark>([\s\S]*?)<\/mark>/g;

export function parseFtsSnippetSegments(snippet) {
  const text = String(snippet || '');
  const segments = [];
  let lastIndex = 0;
  let match;

  MARK_RE.lastIndex = 0;
  while ((match = MARK_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), highlight: false });
    }
    segments.push({ text: match[1], highlight: true });
    lastIndex = MARK_RE.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), highlight: false });
  }

  return segments;
}
