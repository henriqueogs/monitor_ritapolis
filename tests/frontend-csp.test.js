'use strict';

const fs = require('fs');
const path = require('path');
const { buildCsp, ROTAS_ISR, CSP_ISR_SOURCES } = require('../frontend/lib/csp');

const PROXY_SRC = fs.readFileSync(path.resolve(__dirname, '../frontend/proxy.js'), 'utf8');

function matcherRegex() {
  const m = PROXY_SRC.match(/source:\s*'([^']+)'/);
  if (!m) { throw new Error('matcher source não encontrado em proxy.js'); }
  return new RegExp(`^${m[1]}$`);
}

describe('frontend CSP', () => {
  describe('buildCsp', () => {
    it('com nonce exige o nonce em scripts (strict-dynamic) e não libera inline', () => {
      const csp = buildCsp({ nonce: 'abc', apiOrigin: 'https://api.ritapolis.com' });

      expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
      expect(csp).not.toContain("'unsafe-inline' 'strict-dynamic'");
      expect(csp).toContain("connect-src 'self' https://api.ritapolis.com");
    });

    it('sem nonce (HTML em cache/ISR) libera inline e não usa strict-dynamic', () => {
      const csp = buildCsp({ nonce: null, apiOrigin: 'https://api.ritapolis.com' });

      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
      expect(csp).not.toContain('strict-dynamic');
      expect(csp).not.toContain('nonce-');
      expect(csp).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
    });

    it('mantém as restrições de origem nos dois modos', () => {
      for (const nonce of ['abc', null]) {
        const csp = buildCsp({ nonce });
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("object-src 'none'");
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).toContain('frame-src \'self\' https://ritapolis.mg.gov.br');
        expect(csp).toContain('upgrade-insecure-requests');
      }
    });

    it('em dev libera unsafe-eval e omite upgrade-insecure-requests', () => {
      const csp = buildCsp({ nonce: null, isDev: true });
      expect(csp).toContain("'unsafe-eval'");
      expect(csp).not.toContain('upgrade-insecure-requests');
    });
  });

  describe('rotas ISR fora do middleware de nonce', () => {
    const exemplosIsr = [
      '/empenho/10643',
      '/transparencia/servidores/efetivo/1234',
      '/legislacao/camara/projetos/55',
      '/legislacao/camara/vereadores/7',
    ];
    const exemplosDinamicos = [
      '/',
      '/sobre',
      '/transparencia/servidores',
      '/legislacao/camara/projetos',
      '/legislacao/camara/vereadores',
      '/transparencia/categoria/diarias',
      '/admin',
    ];

    it('o matcher do proxy não roda nas rotas ISR', () => {
      const re = matcherRegex();
      for (const url of exemplosIsr) { expect(re.test(url)).toBe(false); }
    });

    it('o matcher do proxy continua rodando nas páginas dinâmicas e no admin', () => {
      const re = matcherRegex();
      for (const url of exemplosDinamicos) { expect(re.test(url)).toBe(true); }
    });

    it('cada rota ISR tem CSP estático configurado', () => {
      expect(CSP_ISR_SOURCES).toHaveLength(ROTAS_ISR.length);
      for (const url of exemplosIsr) {
        expect(ROTAS_ISR.some((prefixo) => url.startsWith(prefixo))).toBe(true);
      }
    });
  });
});
