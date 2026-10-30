'use strict';

const { corrigirGrafiaDoEnte } = require('./nome-ente');
const { ente } = require('../ente');

describe('corrigirGrafiaDoEnte', () => {
  it('corrige erro de digitação conhecido do nome do município', () => {
    const r = corrigirGrafiaDoEnte(
      'Aprova as contas da Prefeitura Municipal de Eitápois relativas a 2022.'
    );
    expect(r.texto).toBe(
      `Aprova as contas da Prefeitura Municipal de ${ente.nome} relativas a 2022.`
    );
    expect(r.corrigido).toBe(true);
  });

  it('ignora acento e caixa na grafia errada', () => {
    expect(corrigirGrafiaDoEnte('contas de EITAPOIS').texto).toBe(`contas de ${ente.nome}`);
  });

  it('não mexe no nome correto nem em outros municípios', () => {
    const t = `Convênio com ${ente.nome} e com Itápolis (SP).`;
    const r = corrigirGrafiaDoEnte(t);
    expect(r.texto).toBe(t);
    expect(r.corrigido).toBe(false);
  });

  it('aceita texto vazio ou nulo', () => {
    expect(corrigirGrafiaDoEnte(null)).toEqual({ texto: null, corrigido: false });
    expect(corrigirGrafiaDoEnte('')).toEqual({ texto: '', corrigido: false });
  });
});
