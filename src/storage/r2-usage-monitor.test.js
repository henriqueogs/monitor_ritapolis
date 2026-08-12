'use strict';

const {
  billingCycleStart,
  classifyOperations,
  enforceR2UsageGuard,
  evaluateUsage,
  fetchR2Usage,
} = require('./r2-usage-monitor');

const env = {
  CLOUDFLARE_API_TOKEN: 'read-only-token',
  CLOUDFLARE_ACCOUNT_ID: 'account',
  R2_BUCKET: 'monitor-ritapolis-private',
  R2_BILLING_CYCLE_DAY: '12',
};

describe('R2 usage guard', () => {
  test('calculates the current Cloudflare billing cycle', () => {
    expect(billingCycleStart(new Date('2026-08-11T12:00:00Z'), 12).toISOString()).toBe('2026-07-12T00:00:00.000Z');
    expect(billingCycleStart(new Date('2026-08-12T12:00:00Z'), 12).toISOString()).toBe('2026-08-12T00:00:00.000Z');
  });

  test('counts unknown operations as Class A', () => {
    expect(classifyOperations([
      { sum: { requests: 10 }, dimensions: { actionType: 'PutObject' } },
      { sum: { requests: 20 }, dimensions: { actionType: 'GetObject' } },
      { sum: { requests: 30 }, dimensions: { actionType: 'FutureMutation' } },
      { sum: { requests: 40 }, dimensions: { actionType: 'DeleteObject' } },
    ])).toEqual({
      classAOperations: 40,
      classBOperations: 20,
      freeOperations: 40,
      unknownOperations: 30,
      unknownActions: ['FutureMutation'],
    });
  });

  test('warns at 75% and blocks at the configured ceiling', () => {
    expect(evaluateUsage({ storageBytes: 75, classAOperations: 1, classBOperations: 1 }, {
      storageBytes: 100,
      classAOperations: 100,
      classBOperations: 100,
    }).status).toBe('warning');
    expect(evaluateUsage({ storageBytes: 100, classAOperations: 1, classBOperations: 1 }, {
      storageBytes: 100,
      classAOperations: 100,
      classBOperations: 100,
    }).status).toBe('blocked');
  });

  test('parses Cloudflare GraphQL usage data', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          viewer: {
            accounts: [{
              operations: [
                { sum: { requests: 12 }, dimensions: { actionType: 'PutObject' } },
                { sum: { requests: 34 }, dimensions: { actionType: 'GetObject' } },
              ],
              storage: [{
                max: { objectCount: 2, uploadCount: 0, payloadSize: 1000, metadataSize: 50 },
                dimensions: { datetime: '2026-08-12T10:00:00Z' },
              }],
            }],
          },
        },
      }),
    });
    const report = await fetchR2Usage({ env, fetchImpl, now: new Date('2026-08-12T12:00:00Z') });
    expect(report.usage).toMatchObject({ storageBytes: 1050, classAOperations: 12, classBOperations: 34 });
    expect(report.evaluation.status).toBe('ok');
    expect(fetchImpl).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'POST' }));
  });

  test('fails closed when the guard is required without Analytics credentials', async () => {
    await expect(enforceR2UsageGuard({ env: { R2_USAGE_GUARD_REQUIRED: 'true' } }))
      .rejects.toThrow(/obrigatorio/);
  });
});
