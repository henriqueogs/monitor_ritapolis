'use strict';

const { paginacaoDaBusca } = require('../frontend/lib/paginacao');

describe('paginacaoDaBusca', () => {
  it('primeira página por padrão', () => {
    expect(paginacaoDaBusca({}, { limite: 50 })).toEqual({ pagina: 1, limite: 50, offset: 0 });
  });

  it('calcula o offset da página pedida', () => {
    expect(paginacaoDaBusca({ pagina: '3' }, { limite: 50 })).toEqual({ pagina: 3, limite: 50, offset: 100 });
  });

  it('página inválida ou menor que 1 volta para a primeira', () => {
    expect(paginacaoDaBusca({ pagina: 'abc' }, { limite: 50 }).pagina).toBe(1);
    expect(paginacaoDaBusca({ pagina: '-2' }, { limite: 50 }).offset).toBe(0);
  });

  it('respeita o limite máximo da API', () => {
    expect(paginacaoDaBusca({ limite: '500' }, { limite: 50, limiteMax: 100 }).limite).toBe(100);
  });
});
