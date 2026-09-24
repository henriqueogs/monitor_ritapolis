'use strict';

const MARCA_ABRE = '<mark>';
const MARCA_FECHA = '</mark>';

/**
 * Quebra o snippet do FTS5 (texto do documento com <mark>…</mark> em volta
 * dos termos buscados) em partes para renderizar como texto no React.
 * O texto vem de documentos raspados, sem escape: renderizá-lo como HTML
 * permitiria injetar tags. Aqui só <mark> vira destaque; o resto é texto.
 */
function partesDoSnippet(snippet) {
  if (!snippet) {return [];}
  const partes = [];
  for (const bloco of String(snippet).split(MARCA_ABRE)) {
    const fim = bloco.indexOf(MARCA_FECHA);
    if (fim === -1) {
      partes.push({ texto: bloco, destaque: false });
      continue;
    }
    partes.push({ texto: bloco.slice(0, fim), destaque: true });
    partes.push({ texto: bloco.slice(fim + MARCA_FECHA.length), destaque: false });
  }
  return partes.filter((p) => p.texto);
}

module.exports = { partesDoSnippet };
