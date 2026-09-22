'use strict';

const AREAS_FAKE = [
  { id: 'a', titulo: 'Area A', publicUrl: 'https://x/a' },
  { id: 'b', titulo: 'Area B', publicUrl: 'https://x/b' }
];

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

jest.mock('../db', () => ({
  db: { prepare: jest.fn(() => ({ get: () => null })) }
}));

jest.mock('./update-runner', () => ({
  startCollectionUpdate: jest.fn(() => ({ started: false, status: {} })),
  getCollectionUpdateStatus: jest.fn(() => ({ running: false }))
}));

let mockFetchPageShell;

jest.mock('../coletores/site-prefeitura', () => {
  const Coletor = jest.fn().mockImplementation(() => ({
    fetchPageShell: (...args) => mockFetchPageShell(...args),
    extractCadastroGenericoIds: () => [],
    fetchCadastroMeta: jest.fn()
  }));
  Coletor.AREAS = AREAS_FAKE;
  return Coletor;
});

describe('checkPrefeituraSyncOnPortalOpen', () => {
  beforeEach(() => {
    jest.resetModules();
    mockFetchPageShell = jest.fn();
  });

  it('responde rapido mesmo com o coletor demorado (verificacao vai pro background)', async () => {
    const pending = deferred();
    mockFetchPageShell.mockReturnValue(pending.promise); // nunca resolve neste teste

    const { checkPrefeituraSyncOnPortalOpen } = require('./prefeitura-sync');
    const inicio = Date.now();
    const result = await checkPrefeituraSyncOnPortalOpen();

    expect(Date.now() - inicio).toBeLessThan(50);
    expect(result.verificando).toBe(true);
  });

  it('segunda chamada enquanto a verificacao roda nao dispara outra rodada', async () => {
    const pending = deferred();
    mockFetchPageShell.mockReturnValue(pending.promise);

    const { checkPrefeituraSyncOnPortalOpen } = require('./prefeitura-sync');
    await checkPrefeituraSyncOnPortalOpen();
    await checkPrefeituraSyncOnPortalOpen();

    expect(mockFetchPageShell).toHaveBeenCalledTimes(AREAS_FAKE.length);
  });

  it('consulta as areas em paralelo, nao em serie', async () => {
    const deferreds = AREAS_FAKE.map(() => deferred());
    let call = 0;
    mockFetchPageShell.mockImplementation(() => deferreds[call++].promise);

    const { checkPrefeituraSyncOnPortalOpen } = require('./prefeitura-sync');
    await checkPrefeituraSyncOnPortalOpen();

    // Serial so chamaria a 2a area depois da 1a resolver -- aqui nenhuma resolveu ainda.
    expect(mockFetchPageShell).toHaveBeenCalledTimes(AREAS_FAKE.length);

    deferreds.forEach((d, i) => d.resolve({ url: `https://x/${i}`, html: '' }));
    await new Promise((r) => setImmediate(r));
  });
});
