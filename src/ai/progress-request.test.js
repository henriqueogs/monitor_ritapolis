'use strict';
const { generateWithProgress } = require('./progress-request');
const { createProgress } = require('../pipeline/progress');
const { DatabaseSync } = require('node:sqlite');
let db;
beforeEach(() => {
  jest.useFakeTimers();
  db = new DatabaseSync(':memory:');
});
afterEach(() => {
  db.close();
  jest.useRealTimers();
});
test('does not send tiny requests at the end of the slice', async () => {
  const provider = { generateJson: jest.fn() };
  await expect(
    generateWithProgress(
      provider,
      {},
      createProgress(db, 'x', { deadline: Date.now() + 30000 }),
      120000
    )
  ).rejects.toMatchObject({ code: 'PIPELINE_YIELD' });
  expect(provider.generateJson).not.toHaveBeenCalled();
});
test('own clipped timeout yields while a real full-budget timeout remains an error', async () => {
  const provider = {
    generateJson: jest.fn(async ({ timeoutMs }) => {
      jest.advanceTimersByTime(timeoutMs);
      throw new Error('Request timed out.');
    }),
  };
  await expect(
    generateWithProgress(
      provider,
      {},
      createProgress(db, 'x', { deadline: Date.now() + 60000 }),
      120000
    )
  ).rejects.toMatchObject({ code: 'PIPELINE_YIELD' });
  expect(provider.generateJson.mock.calls[0][0]).toMatchObject({ timeoutMs: 59000, maxRetries: 0 });
  await expect(generateWithProgress(provider, {}, createProgress(db, 'x'), 120000)).rejects.toThrow(
    'Request timed out.'
  );
});
test('early provider timeouts and authentication errors are never hidden as continuation', async () => {
  for (const message of ['Request timed out.', '401 unauthorized']) {
    await expect(
      generateWithProgress(
        {
          generateJson: async () => {
            throw new Error(message);
          },
        },
        {},
        createProgress(db, 'x', { deadline: Date.now() + 60000 }),
        120000
      )
    ).rejects.toThrow(message);
  }
});
