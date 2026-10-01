'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const Camara = require('./camara-legislacao');
const { createProgress, PipelineYield } = require('../pipeline/progress');
let db;
beforeEach(() => {
  db = new DatabaseSync(':memory:');
});
afterEach(() => db.close());
test('interrupted listing resumes after cached pages instead of fetching first pages again', async () => {
  const fixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, '__fixtures__/camara-legislacao-exemplo.json'))
  );
  const collector = new Camara();
  const progress = createProgress(db, 'collection');
  collector.progress = progress;
  let stop = false;
  progress.checkTime = () => {
    if (stop) {
      throw new PipelineYield();
    }
  };
  collector.buscarPagina = jest.fn(async () => {
    stop = true;
    return fixture.HTML;
  });
  await expect(collector.collectRecords()).rejects.toMatchObject({ code: 'PIPELINE_YIELD' });
  const resumed = new Camara();
  resumed.progress = createProgress(db, 'collection');
  resumed.buscarPagina = jest.fn(async () => '');
  const result = await resumed.collectRecords();
  expect(result).toHaveLength(3);
  expect(resumed.buscarPagina).toHaveBeenCalledTimes(1);
  expect(resumed.buscarPagina).toHaveBeenCalledWith(2);
});
test('interrupted persistence skips completed items, but still processes remaining official records', async () => {
  const records = [
    { numero: '1', exercicio: 2026 },
    { numero: '2', exercicio: 2026 },
  ];
  const collector = new Camara();
  const progress = createProgress(db, 'collection');
  collector.progress = progress;
  let stop = false;
  progress.checkTime = () => {
    if (stop) {
      throw new PipelineYield();
    }
  };
  collector.collectRecords = jest.fn(async () => records);
  collector.processarRegistro = jest.fn(async () => {
    stop = true;
  });
  await expect(collector.executar({ detalhes: [], itens_com_erro: 0 })).rejects.toMatchObject({
    code: 'PIPELINE_YIELD',
  });
  const resumed = new Camara();
  resumed.progress = createProgress(db, 'collection');
  resumed.collectRecords = jest.fn(async () => records);
  resumed.processarRegistro = jest.fn(async () => {});
  await resumed.executar({ detalhes: [], itens_com_erro: 0 });
  expect(resumed.processarRegistro).toHaveBeenCalledTimes(1);
  expect(resumed.processarRegistro.mock.calls[0][0].numero).toBe('2');
});
