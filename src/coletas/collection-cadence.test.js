'use strict';
jest.mock('../config', () => ({ dailySchedulerTransparenciaIntervalHoras: 24 }));
const { planCollectionYears, utcTimestamp } = require('./collection-cadence');

const now = new Date('2026-09-30T10:00:00Z');
function plan(logs, force = false) {
  return planCollectionYears({ anoInicio: 2019, now, force, getLog: (ano) => logs[ano] });
}
describe('collection-cadence', () => {
  test('current year first, at most one historical year', () => {
    expect(plan({})).toEqual([2026, 2025]);
  });
  test('a historical success cannot hide a stale current year', () => {
    expect(plan({ 2025: { status: 'ok', coletado_em: '2026-09-30 09:00:00' } })).toEqual([2026]);
  });
  test('fresh current year does not force all history to run daily', () => {
    const logs = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [2019 + i,
      { status: 'ok', coletado_em: '2026-09-29 18:00:00' }]));
    expect(plan(logs)).toEqual([]);
  });
  test('history rotates by oldest check and previous year is weekly', () => {
    expect(plan({ 2026: { status: 'ok', coletado_em: '2026-09-30 09:00:00' },
      2025: { status: 'ok', coletado_em: '2026-09-28 09:00:00' } })).toEqual([2024]);
  });
  test('errors back off rather than retrying on every 30-minute tick', () => {
    expect(plan({ 2026: { status: 'erro_parcial', coletado_em: '2026-09-30 09:00:00' },
      2025: { status: 'ok', coletado_em: '2026-09-30 09:00:00' } })).toEqual([]);
  });
  test('explicit full reconciliation remains possible and recent-first', () => {
    expect(plan({}, true)).toEqual([2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019]);
  });
  test('SQLite timestamps are interpreted as UTC', () => {
    expect(utcTimestamp('2026-09-30 10:00:00')).toBe(now.getTime());
    expect(utcTimestamp('2026-09-30T10:00:00Z')).toBe(now.getTime());
  });
});
