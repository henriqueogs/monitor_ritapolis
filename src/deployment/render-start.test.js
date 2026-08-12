'use strict';

const { DEFAULT_HANDOFF_DELAY_MS, handoffDelayMs } = require('../../scripts/render-start');

describe('Render database handoff', () => {
  test('uses a safe default delay when unset or too short', () => {
    expect(handoffDelayMs({})).toBe(DEFAULT_HANDOFF_DELAY_MS);
    expect(handoffDelayMs({ RENDER_HANDOFF_DELAY_MS: '30000' })).toBe(DEFAULT_HANDOFF_DELAY_MS);
  });

  test('accepts a safe delay and caps accidental excessive values', () => {
    expect(handoffDelayMs({ RENDER_HANDOFF_DELAY_MS: '120000' })).toBe(120_000);
    expect(handoffDelayMs({ RENDER_HANDOFF_DELAY_MS: '9999999' })).toBe(600_000);
  });
});
