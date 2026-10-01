'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
jest.mock('../db/camara-repo', () => ({
  upsertProjeto: jest.fn(() => 'inserted'), upsertVereador: jest.fn(() => 'inserted'),
  upsertMandato: jest.fn(), upsertCamaraColetaLog: jest.fn(),
}));
jest.mock('../db', () => ({ createColetaLog: jest.fn(() => 1), finishColetaLog: jest.fn() }));
const { upsertProjeto, upsertVereador, upsertMandato } = require('../db/camara-repo');
const Prefeitura = require('./site-prefeitura');
const Projetos = require('./camara-projetos');
const Base = require('./base');
const { createProgress, PipelineYield } = require('../pipeline/progress');
const result = () => ({ itens_novos: 0, itens_atualizados: 0, itens_sem_alteracao: 0,
  itens_com_erro: 0, detalhes: [] });
let db;
beforeEach(() => { db = new DatabaseSync(':memory:'); jest.clearAllMocks(); });
afterEach(() => db.close());

test('Prefeitura retoma paginas parseadas sem refazer shell, metadados e primeira pagina', async () => {
  const target = Prefeitura.AREAS[0];
  const c = new Prefeitura();
  const p = createProgress(db, 'prefeitura'); c.progress = p;
  let stop = false;
  p.checkTime = () => { if (stop) { throw new PipelineYield(); } };
  c.fetchPageShell = jest.fn(async () => ({ html: 'shell' }));
  c.extractCadastroGenericoIds = () => [50];
  c.fetchCadastroMeta = jest.fn(async () => ({ title: 'Editais' }));
  c.fetchCadastroPage = jest.fn(async () => { stop = true; return 'pagina0'; });
  c.getTotalPages = () => 2;
  c.parseRecords = (_url, _title, html) => [{ titulo: html }];
  await expect(c.collectRecordsForPage(target)).rejects.toMatchObject({ code: 'PIPELINE_YIELD' });
  const resumed = new Prefeitura(); resumed.progress = createProgress(db, 'prefeitura');
  resumed.fetchPageShell = jest.fn(); resumed.fetchCadastroMeta = jest.fn();
  resumed.fetchCadastroPage = jest.fn(async () => 'pagina1');
  resumed.parseRecords = c.parseRecords;
  expect(await resumed.collectRecordsForPage(target)).toEqual([{ titulo: 'pagina0' }, { titulo: 'pagina1' }]);
  expect(resumed.fetchPageShell).not.toHaveBeenCalled();
  expect(resumed.fetchCadastroMeta).not.toHaveBeenCalled();
  expect(resumed.fetchCadastroPage).toHaveBeenCalledTimes(1);
  expect(resumed.fetchCadastroPage).toHaveBeenCalledWith(50, 1);
});

test('Prefeitura persiste contador antes da pausa e nao repete item concluido', async () => {
  const c = new Prefeitura(); const p = createProgress(db, 'prefeitura'); c.progress = p;
  let stop = false;
  p.checkTime = () => { if (stop) { throw new PipelineYield(); } };
  c.collectRecordsForPage = jest.fn(async target => target === Prefeitura.AREAS[0]
    ? [{ numero: 1 }, { numero: 2 }] : []);
  c.processarRegistro = jest.fn(async (_record, r) => { r.itens_novos++; stop = true; });
  await expect(c.run()).rejects.toMatchObject({ code: 'PIPELINE_YIELD' });
  const resumed = new Prefeitura(); resumed.progress = createProgress(db, 'prefeitura');
  resumed.collectRecordsForPage = c.collectRecordsForPage;
  resumed.processarRegistro = jest.fn(async (_record, r) => { r.itens_novos++; });
  const r = await resumed.run();
  expect(r.itens_novos).toBe(2);
  expect(resumed.processarRegistro).toHaveBeenCalledTimes(1);
  expect(resumed.processarRegistro.mock.calls[0][0]).toEqual({ numero: 2 });
});

test('projetos retomam pagina e importam somente registros ainda nao concluidos', async () => {
  const html = JSON.parse(fs.readFileSync(path.join(__dirname, '__fixtures__/camara-projetos-exemplo.json'))).HTML;
  const c = new Projetos(); const p = createProgress(db, 'projetos'); c.progress = p;
  let stop = false;
  p.checkTime = () => { if (stop) { throw new PipelineYield(); } };
  c.buscarProjetosPagina = jest.fn(async () => html);
  upsertProjeto.mockImplementationOnce(() => { stop = true; return 'inserted'; });
  await expect(c.coletarProjetos(result())).rejects.toMatchObject({ code: 'PIPELINE_YIELD' });
  const resumed = new Projetos(); resumed.progress = createProgress(db, 'projetos');
  resumed.buscarProjetosPagina = jest.fn(async () => '');
  const r = resumed.progress.load('collector-result');
  await resumed.coletarProjetos(r);
  expect(r.itens_novos).toBe(4);
  expect(upsertProjeto).toHaveBeenCalledTimes(4);
  expect(resumed.buscarProjetosPagina).toHaveBeenCalledTimes(1);
  expect(resumed.buscarProjetosPagina).toHaveBeenCalledWith(2);
  await resumed.coletarProjetos(r);
  expect(upsertProjeto).toHaveBeenCalledTimes(4);
});

test('pausa ao obter mandatos nao importa vereador antes do download; lista e retomada', async () => {
  const c = new Projetos(); c.progress = createProgress(db, 'vereadores');
  c.buscarVereadores = jest.fn(async () => [{ intPes: 1 }]);
  c.buscarMandatos = jest.fn(async () => { throw new PipelineYield(); });
  await expect(c.coletarVereadores(result())).rejects.toMatchObject({ code: 'PIPELINE_YIELD' });
  expect(upsertVereador).not.toHaveBeenCalled();
  const resumed = new Projetos(); resumed.progress = createProgress(db, 'vereadores');
  resumed.buscarVereadores = jest.fn();
  resumed.buscarMandatos = jest.fn(async () => [{ ano: 2026 }]);
  await resumed.coletarVereadores(result());
  expect(resumed.buscarVereadores).not.toHaveBeenCalled();
  expect(upsertVereador).toHaveBeenCalledTimes(1);
  expect(upsertMandato).toHaveBeenCalledWith({ intPes: 1, ano: 2026 });
});

test('checkpoint conserva retorno vazio e prazo expirado nao inicia HTTP', async () => {
  const c = new Base({ fonte: 'test' }); c.progress = createProgress(db, 'base');
  const read = jest.fn(async () => []);
  expect(await c.checkpoint('empty', read)).toEqual([]);
  expect(await c.checkpoint('empty', read)).toEqual([]);
  expect(read).toHaveBeenCalledTimes(1);
  c.progress = createProgress(db, 'expired', { deadline: Date.now() - 1 });
  c.http.request = jest.fn();
  await expect(c.buscarComRetry('https://ritapolis.mg.gov.br/')).rejects.toMatchObject({ code: 'PIPELINE_YIELD' });
  expect(c.http.request).not.toHaveBeenCalled();
});
