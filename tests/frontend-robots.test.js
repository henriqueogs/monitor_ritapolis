'use strict';

const { buildRobotsRules, CAUDA_LONGA } = require('../frontend/lib/robots-rules');

function regraDe(rules, agente) {
  return rules.find((r) => [].concat(r.userAgent).includes(agente));
}

describe('robots rules', () => {
  const rules = buildRobotsRules();

  it('bloqueia o site inteiro para crawlers de IA e de SEO', () => {
    for (const agente of ['GPTBot', 'ClaudeBot', 'DotBot', 'AhrefsBot', 'SemrushBot', 'MJ12bot']) {
      expect(regraDe(rules, agente)).toMatchObject({ disallow: '/' });
    }
  });

  it('PetalBot (buscador) fica fora só da cauda longa', () => {
    const petal = regraDe(rules, 'PetalBot');
    expect(petal.disallow).toEqual(expect.arrayContaining(['/empenho/', '/credores/', '/anexo/']));
    expect(petal.disallow).not.toContain('/');
  });

  it('buscadores gerais (Googlebot, Bingbot) seguem pela regra padrão', () => {
    expect(regraDe(rules, 'Googlebot')).toBeUndefined();
    expect(regraDe(rules, 'bingbot')).toBeUndefined();
    const padrao = regraDe(rules, '*');
    expect(padrao).toMatchObject({ allow: '/' });
    expect(padrao.disallow).toEqual(['/admin', '/login', '/api']);
  });

  it('cauda longa cobre as rotas mais varridas', () => {
    expect(CAUDA_LONGA).toEqual(expect.arrayContaining(['/empenho/', '/credores/', '/anexo/']));
  });
});
