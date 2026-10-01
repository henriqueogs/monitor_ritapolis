'use strict';
const { PipelineYield } = require('../pipeline/progress');
const RESERVE_MS = 1000;

// A time slice is not a provider retry budget. Do not start tiny requests or
// count the worker's own clipped deadline as a failed remote operation.
async function generateWithProgress(provider, request, progress, maxTimeoutMs) {
  if (!progress) {
    return provider.generateJson(request);
  }
  progress.checkTime();
  const remaining = progress.remainingMs();
  if (remaining < Math.min(30000, maxTimeoutMs) + RESERVE_MS) {
    throw new PipelineYield();
  }
  const timeoutMs = Math.min(maxTimeoutMs, remaining - RESERVE_MS);
  const clipped = timeoutMs < maxTimeoutMs;
  try {
    return await provider.generateJson({ ...request, timeoutMs, maxRetries: 0 });
  } catch (error) {
    if (
      clipped &&
      /timeout|timed out/i.test(String(error.message)) &&
      progress.remainingMs() <= RESERVE_MS
    ) {
      throw new PipelineYield();
    }
    throw error;
  }
}
module.exports = { generateWithProgress };
