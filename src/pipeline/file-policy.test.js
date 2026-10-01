'use strict';
const { DatabaseSync } = require('node:sqlite');
const { createFilePolicy } = require('./file-policy');
test('oversized official file is not downloaded every collection and becomes due after thirty days', () => {
  const db = new DatabaseSync(':memory:');
  const policy = createFilePolicy(db);
  const date = new Date('2026-09-30T20:00:00Z');
  const url = 'https://official.example/file.pdf';
  policy.record(url, new Error('maxContentLength size of 52428800 exceeded'), date);
  expect(() => policy.check(url, new Date('2026-10-01T20:00:00Z'))).toThrow('arquivo em revisao');
  expect(() => policy.check(url, new Date('2026-10-30T20:00:00Z'))).not.toThrow();
  expect(() => policy.check(`${url}?revision=2`, date)).not.toThrow();
  policy.record('https://official.example/network.pdf', new Error('ECONNRESET'), date);
  expect(() => policy.check('https://official.example/network.pdf', date)).not.toThrow();
  db.close();
});
