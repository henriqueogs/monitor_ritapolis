'use strict';

const { criarUltimoBom } = require('../frontend/lib/ultimo-bom');

const erroRede = () =>
  new Error('Falha ao conectar na API x: fetch failed (other side closed)', {
    cause: new TypeError('fetch failed'),
  });

describe('frontend ultimo-bom', () => {
  it('devolve o dado e o guarda para a próxima falha', async () => {
    const lerComFallback = criarUltimoBom();
    expect(await lerComFallback('/a', async () => ({ v: 1 }))).toEqual({ v: 1 });
    const r = await lerComFallback('/a', async () => {
      throw erroRede();
    });
    expect(r).toEqual({ v: 1 });
  });

  it('sem dado anterior, a falha de conexão sobe (primeira carga)', async () => {
    const lerComFallback = criarUltimoBom();
    await expect(
      lerComFallback('/a', async () => {
        throw erroRede();
      })
    ).rejects.toThrow(/Falha ao conectar/);
  });

  it('erro que não é de conexão (HTTP 500, parsing) nunca é mascarado', async () => {
    const lerComFallback = criarUltimoBom();
    await lerComFallback('/a', async () => ({ v: 1 }));
    await expect(
      lerComFallback('/a', async () => {
        throw new Error('Falha ao carregar /a (500)');
      })
    ).rejects.toThrow(/500/);
  });

  it('chaves independentes', async () => {
    const lerComFallback = criarUltimoBom();
    await lerComFallback('/a', async () => ({ v: 'a' }));
    await expect(
      lerComFallback('/b', async () => {
        throw erroRede();
      })
    ).rejects.toThrow();
  });

  it('limita o número de entradas guardadas (descarta a mais antiga)', async () => {
    const lerComFallback = criarUltimoBom({ maximo: 2 });
    await lerComFallback('/a', async () => 1);
    await lerComFallback('/b', async () => 2);
    await lerComFallback('/c', async () => 3);
    await expect(
      lerComFallback('/a', async () => {
        throw erroRede();
      })
    ).rejects.toThrow();
    expect(
      await lerComFallback('/c', async () => {
        throw erroRede();
      })
    ).toBe(3);
  });
});
