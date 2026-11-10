'use strict';

const { cabecalhoFrontendSsr, CABECALHO_FRONTEND } = require('../frontend/lib/frontend-token');

describe('frontend-token', () => {
  it('no servidor, com FRONTEND_SSR_TOKEN, manda o cabeçalho da cota própria da API', () => {
    const token = 'x'.repeat(40);

    expect(cabecalhoFrontendSsr({ env: { FRONTEND_SSR_TOKEN: token }, isServidor: true })).toEqual({
      [CABECALHO_FRONTEND]: token,
    });
  });

  it('no navegador nunca manda o segredo', () => {
    expect(cabecalhoFrontendSsr({ env: { FRONTEND_SSR_TOKEN: 'x'.repeat(40) }, isServidor: false })).toEqual({});
  });

  it('sem token configurado não manda nada', () => {
    expect(cabecalhoFrontendSsr({ env: {}, isServidor: true })).toEqual({});
  });

  it('o nome do cabeçalho é o que a API confere (src/api/security.js)', () => {
    expect(CABECALHO_FRONTEND.toLowerCase()).toBe('x-frontend-token');
  });
});
