'use strict';

const { buildPageMetadata, PUBLIC_PAGES } = require('../frontend/lib/page-metadata');
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
