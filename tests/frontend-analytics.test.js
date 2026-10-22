'use strict';

const fs = require('fs');
const path = require('path');
const { buildCsp } = require('../frontend/lib/csp');

const LAYOUT_SRC = fs.readFileSync(path.resolve(__dirname, '../frontend/app/layout.js'), 'utf8');
const FRONTEND_PKG = require('../frontend/package.json');

describe('frontend Vercel Analytics', () => {
  it('declara @vercel/analytics como dependência do frontend', () => {
    expect(FRONTEND_PKG.dependencies).toHaveProperty('@vercel/analytics');
  });

  it('renderiza <Analytics /> do adaptador Next no layout raiz', () => {
    expect(LAYOUT_SRC).toMatch(/import\s*\{\s*Analytics\s*\}\s*from\s*'@vercel\/analytics\/next'/);
    expect(LAYOUT_SRC).toContain('<Analytics />');
  });

  it('CSP permite o script e o envio same-origin (/_vercel/insights) nos dois modos', () => {
    for (const nonce of ['abc', null]) {
      const csp = buildCsp({ nonce });
      expect(csp).toMatch(/script-src 'self'/);
      expect(csp).toMatch(/connect-src 'self'/);
    }
  });
});
