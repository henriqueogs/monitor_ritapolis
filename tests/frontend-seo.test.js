'use strict';

const { buildPageMetadata, buildContentMetadata, PUBLIC_PAGES } = require('../frontend/lib/page-metadata');
const config = { siteUrl: 'https://example.org', brand: 'Ritápolis.com' };

describe('public page search metadata', () => {
  it('gives every public entry page a distinct title and canonical URL', () => {
    const pages = Object.keys(PUBLIC_PAGES).map((path) => buildPageMetadata(path, config));
    expect(new Set(pages.map((p) => p.title.absolute)).size).toBe(pages.length);
    expect(new Set(pages.map((p) => p.alternates.canonical)).size).toBe(pages.length);
    for (const page of pages) {
      expect(page.title.absolute).toContain('Ritápolis');
      expect(page.description).toBeTruthy();
      expect(page.openGraph.url).toBe(page.alternates.canonical);
      expect(page.openGraph.title).toBe(page.title.absolute);
    }
  });

  it('rejects unknown routes instead of publishing misleading metadata', () => {
    expect(() => buildPageMetadata('/unknown', config)).toThrow();
  });
});

describe('individual public content metadata', () => {
  it('preserves the document identity and city with its own canonical and sharing metadata', () => {
    const metadata = buildContentMetadata({ path: '/documento/691', title: 'Locação de ônibus e vans', number: '0076/2026', description: 'Resumo\n com   fonte.' }, config);
    expect(metadata.title.absolute).toContain('0076/2026');
    expect(metadata.title.absolute).toContain('Ritápolis');
    expect(metadata.description).toBe('Resumo com fonte.');
    expect(metadata.alternates.canonical).toBe('https://example.org/documento/691');
    expect(metadata.openGraph.url).toBe(metadata.alternates.canonical);
    expect(metadata.twitter.title).toBe(metadata.title.absolute);
  });

  it('never serializes an object as a public description and avoids repeating the number', () => {
    const metadata = buildContentMetadata({ path: '/documento/1', title: 'Lei 123/2026 de Ritápolis', number: '123/2026', description: { descricao: 'Objeto técnico' } }, config);
    expect(metadata.description).toBe('Lei 123/2026 de Ritápolis');
    expect(metadata.title.absolute.match(/123\/2026/g)).toHaveLength(1);
    expect(metadata.description).not.toContain('[object Object]');
  });

  it('bounds a long narrative without ending in a partial word', () => {
    const metadata = buildContentMetadata({ path: '/na-lupa/57', title: 'Quantas árvores foram suprimidas?', description: 'Uma palavra completa. '.repeat(30) }, config);
    expect(metadata.description.length).toBeLessThanOrEqual(200);
    expect(metadata.description).toMatch(/(Uma|palavra|completa\.)…$/);
    expect(metadata.alternates.canonical).toBe('https://example.org/na-lupa/57');
  });
});
