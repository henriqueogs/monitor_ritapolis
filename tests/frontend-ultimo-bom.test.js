'use strict';

const { criarUltimoBom: criar, IDADE_MAXIMA_PADRAO_MS } = require('../frontend/lib/ultimo-bom');
const criarUltimoBom = (opcoes = {}) => criar({ aoEvento: jest.fn(), ...opcoes });

const erroRede = () =>
  new Error('Falha ao conectar na API x: fetch failed (other side closed)', {
    cause: new TypeError('fetch failed'),
  });

describe('frontend ultimo-bom', () => {
  it('não renova a idade em falhas consecutivas e deixa de suprimir o erro após 30 minutos', async () => {
    let tempo = 0;
    const aoEvento = jest.fn();
    const ler = criarUltimoBom({ agora: () => tempo, aoEvento });
    const falhar = async () => { throw erroRede(); };
    await ler('/busca?q=consulta', async () => 1);
    tempo = IDADE_MAXIMA_PADRAO_MS - 1;
    expect(await ler('/busca?q=consulta', falhar)).toBe(1);
    expect(await ler('/busca?q=consulta', falhar)).toBe(1);
    expect(aoEvento).toHaveBeenCalledTimes(1);
    expect(aoEvento).toHaveBeenCalledWith({
      evento: 'api_cache_fallback', rota: '/busca', idadeMs: tempo,
    });
    tempo += 1;
    await expect(ler('/busca?q=consulta', falhar)).rejects.toThrow(/Falha ao conectar/);
  });

  it('uma leitura bem-sucedida recupera o cache e inicia uma nova janela', async () => {
    let tempo = 0;
    const aoEvento = jest.fn();
    const ler = criarUltimoBom({ agora: () => tempo, idadeMaximaMs: 100, aoEvento });
    const falhar = async () => { throw erroRede(); };
    await ler('/a', async () => 1);
    tempo = 50;
    expect(await ler('/a', falhar)).toBe(1);
    tempo = 99;
    expect(await ler('/a', async () => 2)).toBe(2);
    expect(aoEvento).toHaveBeenLastCalledWith({ evento: 'api_cache_recuperado', rota: '/a' });
    tempo = 150;
    expect(await ler('/a', falhar)).toBe(2);
    expect(aoEvento).toHaveBeenCalledTimes(3);
  });

  it('rejeita limites inválidos e permite desabilitar o fallback com idade zero', async () => {
    expect(() => criarUltimoBom({ maximo: 0 })).toThrow(RangeError);
    expect(() => criarUltimoBom({ idadeMaximaMs: Infinity })).toThrow(RangeError);
    const ler = criarUltimoBom({ idadeMaximaMs: 0 });
    await ler('/a', async () => 1);
    await expect(ler('/a', async () => { throw erroRede(); })).rejects.toThrow();
  });

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
