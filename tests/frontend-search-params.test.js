'use strict';

const fs = require('fs');
const path = require('path');

const APP = path.resolve(__dirname, '../frontend/app');

function arquivosJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {return arquivosJs(p);}
    return e.name.endsWith('.js') && !e.name.endsWith('.test.js') ? [p] : [];
  });
}

// Next 16: `searchParams` chega como Promise. Ler campos sem `await` devolve
// undefined — filtros e busca eram ignorados em /acervo, /legislacao e os
// redirects perdiam a query string.
describe('searchParams no App Router (Next 16)', () => {
  it('páginas/conteúdos (export default) que recebem { searchParams } resolvem a Promise', () => {
    const problemas = arquivosJs(APP).filter((arquivo) => {
      const src = fs.readFileSync(arquivo, 'utf8');
      const recebeDesestruturado = /export\s+default\s+(async\s+)?function\s+\w+\s*\(\s*\{[^}]*\bsearchParams\b(?!\s*:)[^}]*\}/.test(src);
      return recebeDesestruturado && !/await\s+searchParams(Promise)?\b/.test(src);
    });

    expect(problemas.map((p) => path.relative(APP, p))).toEqual([]);
  });
});
