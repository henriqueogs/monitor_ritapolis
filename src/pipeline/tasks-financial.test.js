'use strict';
const mockExpenses = jest.fn(async function () {
  return { progress: this.progress, novos: 0, atualizados: 0 };
});
const mockRevenue = jest.fn(async function () {
  return { progress: this.progress };
});
jest.mock('../db', () => ({}));
jest.mock(
  '../coletores/portal-transparencia',
  () =>
    class {
      coletarDespesasJanela(...args) {
        return mockExpenses.apply(this, args);
      }
      coletarReceitas(...args) {
        return mockRevenue.apply(this, args);
      }
    }
);
const { execute } = require('./tasks');
test('expenses and revenue workers forward their one existing pipeline checkpoint namespace', async () => {
  const progress = { marker: 'same-job' };
  await expect(
    execute(
      { kind: 'expenses', payload: '{"ano":2026,"ini":"2026-10-01","fim":"2026-10-07"}' },
      { progress }
    )
  ).resolves.toMatchObject({ progress });
  expect(mockExpenses).toHaveBeenCalledWith(2026, '2026-10-01', '2026-10-07');
  await expect(
    execute({ kind: 'revenue', payload: '{"ano":2026}' }, { progress })
  ).resolves.toEqual({ progress });
});
