'use strict';
process.env.PORTAL_THREAD_DELAY_MS = '0';
const { DatabaseSync } = require('node:sqlite');
const { createProgress, PipelineYield } = require('../pipeline/progress');
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockInterceptor = jest.fn();
const mockUpsert = jest.fn();
const mockExisting = jest.fn();
const mockPayrollUpsert = jest.fn();
const mockExpenseRows = jest.fn();
const mockPayrollRows = jest.fn();
jest.mock('axios', () => ({
  create: () => ({
    get: mockGet,
    post: mockPost,
    interceptors: { request: { use: mockInterceptor } },
  }),
}));
jest.mock('../db/transparencia-repo', () => ({
  upsertDespesa: mockUpsert,
  getDespesaPorEmpenho: mockExisting,
}));
jest.mock('../db/folha-repo', () => ({ upsertFolhaRegistro: mockPayrollUpsert }));
jest.mock('./portal-transparencia-thread', () => ({
  ...jest.requireActual('./portal-transparencia-thread'),
  parseCsvDespesas: (...args) => mockExpenseRows(...args),
}));
jest.mock('./folha-thread', () => ({ parseCsvFolha: (...args) => mockPayrollRows(...args) }));
const { coletarDespesasJanelaViaThread } = require('./portal-transparencia-thread-http');
const { coletarFolhaExercicioViaThread } = require('./folha-thread-http');
let db;
let stopAfter;
let writes;
let detailIdentity;
const expenses = () =>
  [1, 2, 3].map(n => ({
    empenho: `0000${n}-000`,
    exercicio: 2026,
    valor: n,
    tipo: 'EO',
    dataEmpenho: '01/10/2026',
    credorNomeParcial: 'Nome oficial de teste',
  }));
beforeEach(() => {
  jest.clearAllMocks();
  db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE imported(id TEXT PRIMARY KEY, value INTEGER)');
  mockExisting.mockReturnValue(null);
  stopAfter = Infinity;
  writes = 0;
  detailIdentity = null;
  mockGet.mockImplementation(async url => {
    if (url === '/Tempo_Real_Despesa' || url === '/Folha') {
      return {
        headers: { 'set-cookie': ['private-session=value; path=/'] },
        data: 'SHA1_TOKEN=abc&INT_TOKEN=1',
      };
    }
    if (url.startsWith('/converterPara')) {
      return { data: { NM_ARQ_FIM: '/file.csv' } };
    }
    if (url === '/file.csv') {
      return { data: 'official csv input' };
    }
    if (url.startsWith('/Relatorios/Detalhamento')) {
      const id = url.match(/ID8_DESP=(\d+)/)[1];
      return {
        data: `<b>Número:</b>${detailIdentity || `${id.slice(0, 5)}-${id.slice(5)}`}<br><b>Beneficiário:</b>Nome oficial<br>`,
      };
    }
    throw new Error('unexpected HTTP call');
  });
  mockPost.mockImplementation(async url => ({
    data: url.startsWith('/gerar_relatorio') ? '001 - 123' : '001 - /Dados/exact.html',
  }));
  mockExpenseRows.mockImplementation(expenses);
  mockPayrollRows.mockImplementation(() =>
    [1, 2].map(n => ({
      vinculo: String(n),
      matricula: String(n),
      competenciaAno: 2026,
      competenciaMes: 10,
    }))
  );
  mockUpsert.mockImplementation(row => {
    db.prepare('INSERT INTO imported VALUES(?,?)').run(row.empenho, row.valor);
    writes++;
    return 'inserted';
  });
  mockPayrollUpsert.mockImplementation(row => {
    const id = `${row.vinculo}:${row.matricula}`;
    const exists = db.prepare('SELECT 1 FROM imported WHERE id=?').get(id);
    if (exists) {
      return 'unchanged';
    }
    db.prepare('INSERT INTO imported VALUES(?,?)').run(id, 1);
    writes++;
    return 'inserted';
  });
});
afterEach(() => db.close());
const progress = () => {
  const p = createProgress(db, 'same-financial-job');
  const check = p.checkTime;
  p.checkTime = () => {
    check();
    if (writes >= stopAfter) {
      throw new PipelineYield();
    }
  };
  return p;
};

test('expenses resume after row 1 with no repeated CSV/thread or completed detail/upsert', async () => {
  stopAfter = 1;
  await expect(
    coletarDespesasJanelaViaThread(2026, '2026-10-01', '2026-10-07', { progress: progress() })
  ).rejects.toMatchObject({ code: 'PIPELINE_YIELD' });
  stopAfter = Infinity;
  await expect(
    coletarDespesasJanelaViaThread(2026, '2026-10-01', '2026-10-07', { progress: progress() })
  ).resolves.toEqual({ novos: 3, atualizados: 0, semAlteracao: 0, registros: 3 });
  expect(mockPost).toHaveBeenCalledTimes(2);
  expect(mockExpenseRows).toHaveBeenCalledTimes(1);
  expect(mockUpsert.mock.calls.map(([row]) => row.empenho)).toEqual([
    '00001-000',
    '00002-000',
    '00003-000',
  ]);
  expect(mockGet.mock.calls.filter(([url]) => url.includes('ID8_DESP=00001000'))).toHaveLength(1);
});

test('window verification fetches detail only for new or changed empenhos', async () => {
  const identical = {
    tipo: 'EO', data_empenho: '2026-10-01', data_liquidacao: null, data_pagamento: null,
    valor: 1, credor_nome: 'Nome oficial de teste LTDA', unidade: 'Secretaria', historico: 'Compra',
  };
  mockExisting.mockImplementation((_ano, empenho) =>
    empenho === '00001-000'
      ? identical
      : empenho === '00002-000'
        ? { ...identical, valor: 2, data_pagamento: null, unidade: 'Secretaria' }
        : null
  );
  mockExpenseRows.mockReturnValue(
    expenses().map(row => (row.empenho === '00002-000' ? { ...row, dataPagamento: '05/10/2026' } : row))
  );
  await expect(
    coletarDespesasJanelaViaThread(2026, '2026-10-01', '2026-10-07', { progress: progress() })
  ).resolves.toEqual({ novos: 2, atualizados: 0, semAlteracao: 1, registros: 3 });
  expect(mockUpsert.mock.calls.map(([row]) => row.empenho)).toEqual(['00002-000', '00003-000']);
  expect(mockGet.mock.calls.filter(([url]) => url.includes('ID8_DESP=00001000'))).toHaveLength(0);
  expect(mockGet.mock.calls.filter(([url]) => url.includes('ID8_DESP=00002000'))).toHaveLength(1);
});

test('expense detail mismatch or network error preserves canonical data and leaves row pending', async () => {
  detailIdentity = '99999-000';
  await expect(
    coletarDespesasJanelaViaThread(2026, '2026-10-01', '2026-10-07', { progress: progress() })
  ).rejects.toThrow('outro empenho');
  expect(mockUpsert).not.toHaveBeenCalled();
  detailIdentity = null;
  const get = mockGet.getMockImplementation();
  mockGet.mockImplementation(url =>
    url.startsWith('/Relatorios') ? Promise.reject(new Error('ECONNRESET')) : get(url)
  );
  await expect(
    coletarDespesasJanelaViaThread(2026, '2026-10-01', '2026-10-07', { progress: progress() })
  ).rejects.toThrow('ECONNRESET');
  expect(db.prepare('SELECT COUNT(*) AS n FROM imported').get().n).toBe(0);
});

test('expense CSV from another exercise cannot be linked to this exercise', async () => {
  mockExpenseRows.mockReturnValue([{ ...expenses()[0], exercicio: 2025 }]);
  await expect(
    coletarDespesasJanelaViaThread(2026, '2026-10-01', '2026-10-07', { progress: progress() })
  ).rejects.toThrow('diverge');
  expect(mockUpsert).not.toHaveBeenCalled();
});

test('payroll resumes a completed admission group and a partial group without another first-group download', async () => {
  stopAfter = 1;
  await expect(
    coletarFolhaExercicioViaThread(2026, { progress: progress() })
  ).rejects.toMatchObject({ code: 'PIPELINE_YIELD' });
  stopAfter = Infinity;
  await expect(coletarFolhaExercicioViaThread(2026, { progress: progress() })).resolves.toEqual({
    novos: 2,
    atualizados: 0,
    semAlteracao: 14,
    registros: 16,
  });
  expect(mockPayrollRows).toHaveBeenCalledTimes(8);
  expect(mockPost.mock.calls.filter(([url]) => url.startsWith('/gerar_relatorio'))).toHaveLength(8);
  expect(mockPayrollUpsert).toHaveBeenCalledTimes(16);
  expect(db.prepare('SELECT COUNT(*) AS n FROM pipeline_progress').get().n).toBe(16);
});

test('payroll from another exercise is not saved as this exercise', async () => {
  mockPayrollRows.mockReturnValue([{ vinculo: '1', matricula: '1', competenciaAno: 2025 }]);
  await expect(coletarFolhaExercicioViaThread(2026, { progress: progress() })).rejects.toThrow(
    'diverge'
  );
  expect(mockPayrollUpsert).not.toHaveBeenCalled();
});
