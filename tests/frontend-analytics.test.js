'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const ler = arquivo => fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');

describe('Vercel Web Analytics (plano Hobby): contagem agregada de visitas', () => {
  it('o pacote @vercel/analytics é dependência do frontend', () => {
    const pkg = JSON.parse(ler('frontend/package.json'));

    expect(pkg.dependencies['@vercel/analytics']).toBeDefined();
  });

  it('o layout raiz monta <Analytics /> uma única vez', () => {
    const layout = ler('frontend/app/layout.js');

    expect(layout).toMatch(/import \{ Analytics \} from '@vercel\/analytics\/next'/);
    expect(layout.match(/<Analytics \/>/g)).toHaveLength(1);
  });

  it('o CSP já permite o script e o beacon do Analytics (mesma origem, sem domínio extra)', () => {
    const { buildCsp } = require('../frontend/lib/csp');
    const csp = buildCsp({ nonce: 'abc' });

    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/vercel-scripts|va\.vercel/);
  });
});
