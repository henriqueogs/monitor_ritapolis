'use strict';
const { DatabaseSync } = require('node:sqlite');
const { createProgress, PipelineYield } = require('../pipeline/progress');
const { checkpointInput, processRows } = require('./financial-resume');
let db;
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE rows(id INTEGER PRIMARY KEY, value TEXT)');
});
afterEach(() => db.close());

test('interrupted financial import resumes the next row with original counters and only two checkpoint entries', async () => {
  let progress = createProgress(db, 'same-job');
  const read = jest.fn(async () => ['a', 'b', 'c']);
  const rows = await checkpointInput(progress, 'window', read);
  const prepared = [];
  const persist = row => {
    db.prepare('INSERT INTO rows(value) VALUES(?)').run(row);
    return 'inserted';
  };
  await expect(
    processRows(
      progress,
      'window',
      rows,
      async row => {
        if (row === 'b') {
          throw new PipelineYield();
        }
        prepared.push(row);
        return row;
      },
      persist
    )
  ).rejects.toMatchObject({ code: 'PIPELINE_YIELD' });
  expect(progress.load('window:cursor')).toMatchObject({ next: 1, novos: 1 });
  // New process, same DB/job namespace. No second input download or first row.
  progress = createProgress(db, 'same-job');
  const restored = await checkpointInput(progress, 'window', read);
  await expect(
    processRows(
      progress,
      'window',
      restored,
      async row => {
        prepared.push(row);
        return row;
      },
      persist
    )
  ).resolves.toEqual({ novos: 3, atualizados: 0, semAlteracao: 0, registros: 3 });
  expect(prepared).toEqual(['a', 'b', 'c']);
  expect(read).toHaveBeenCalledTimes(1);
  expect(db.prepare('SELECT COUNT(*) AS n FROM rows').get().n).toBe(3);
  expect(db.prepare('SELECT COUNT(*) AS n FROM pipeline_progress').get().n).toBe(2);
  await processRows(
    progress,
    'window',
    restored,
    async () => {
      throw new Error('must not replay');
    },
    persist
  );
  expect(db.prepare('SELECT COUNT(*) AS n FROM rows').get().n).toBe(3);
});

test('failure between canonical write and cursor commit rolls both back; retry cannot skip the row', async () => {
  const progress = createProgress(db, 'same-job');
  const originalSave = progress.save;
  progress.save = jest.fn(() => {
    throw new Error('simulated checkpoint failure');
  });
  const persist = () => {
    db.exec("INSERT INTO rows(value) VALUES('exact')");
    return 'inserted';
  };
  await expect(processRows(progress, 'window', ['a'], async row => row, persist)).rejects.toThrow(
    'checkpoint failure'
  );
  expect(db.prepare('SELECT COUNT(*) AS n FROM rows').get().n).toBe(0);
  expect(progress.load('window:cursor')).toBeNull();
  progress.save = originalSave;
  await expect(
    processRows(progress, 'window', ['a'], async row => row, persist)
  ).resolves.toMatchObject({ novos: 1 });
  expect(db.prepare('SELECT COUNT(*) AS n FROM rows').get().n).toBe(1);
});

test('invalid financial identity is not counted as successful or checkpointed', async () => {
  const progress = createProgress(db, 'same-job');
  await expect(
    processRows(
      progress,
      'window',
      ['a'],
      async row => row,
      () => null
    )
  ).rejects.toThrow('identidade incompleta');
  expect(progress.load('window:cursor')).toBeNull();
});

test('a different job/input namespace downloads and evaluates revised official data afresh', async () => {
  const read = jest.fn().mockResolvedValueOnce(['old']).mockResolvedValueOnce(['new']);
  expect(await checkpointInput(createProgress(db, 'job1'), 'window', read)).toEqual(['old']);
  expect(await checkpointInput(createProgress(db, 'job2'), 'window', read)).toEqual(['new']);
  expect(read).toHaveBeenCalledTimes(2);
});
