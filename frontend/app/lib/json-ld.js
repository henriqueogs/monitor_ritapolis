// JSON.stringify nao escapa "<" — um valor com "</script>" (ex.: titulo de
// documento extraido de PDF/OCR de terceiros) quebraria a tag e injetaria
// HTML/JS arbitrario na pagina. Trocar cada "<" pela sequencia de escape
// Unicode equivalente mantem o JSON-LD valido e inofensivo dentro da tag
// <script type="application/ld+json">.
export function safeJsonLdHtml(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
