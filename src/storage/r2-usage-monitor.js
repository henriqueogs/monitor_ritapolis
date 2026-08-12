'use strict';

const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';

const CLASS_A_ACTIONS = new Set([
  'ListBuckets',
  'PutBucket',
  'ListObjects',
  'PutObject',
  'CopyObject',
  'CompleteMultipartUpload',
  'CreateMultipartUpload',
  'LifecycleStorageTierTransition',
  'ListMultipartUploads',
  'UploadPart',
  'UploadPartCopy',
  'ListParts',
  'PutBucketEncryption',
  'PutBucketCors',
  'PutBucketLifecycleConfiguration',
].map(normalizeAction));

const CLASS_B_ACTIONS = new Set([
  'HeadBucket',
  'HeadObject',
  'GetObject',
  'UsageSummary',
  'GetBucketEncryption',
  'GetBucketLocation',
  'GetBucketCors',
  'GetBucketLifecycleConfiguration',
].map(normalizeAction));

const FREE_ACTIONS = new Set([
  'DeleteObject',
  'DeleteBucket',
  'AbortMultipartUpload',
].map(normalizeAction));

const DEFAULT_LIMITS = Object.freeze({
  storageBytes: 8_000_000_000,
  classAOperations: 800_000,
  classBOperations: 8_000_000,
});

function normalizeAction(action) {
  return String(action || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function limitsFromEnv(env = process.env) {
  return {
    storageBytes: positiveNumber(env.R2_MAX_STORAGE_BYTES, DEFAULT_LIMITS.storageBytes),
    classAOperations: positiveNumber(env.R2_MAX_CLASS_A_OPS, DEFAULT_LIMITS.classAOperations),
    classBOperations: positiveNumber(env.R2_MAX_CLASS_B_OPS, DEFAULT_LIMITS.classBOperations),
  };
}

function billingCycleStart(now = new Date(), cycleDay = 1) {
  const day = Math.min(Math.max(Math.trunc(positiveNumber(cycleDay, 1)), 1), 28);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const currentCycleStarted = now.getUTCDate() >= day;
  return new Date(Date.UTC(year, currentCycleStarted ? month : month - 1, day));
}

function classifyOperations(groups = []) {
  const totals = { classAOperations: 0, classBOperations: 0, freeOperations: 0, unknownOperations: 0 };
  const unknownActions = new Set();

  for (const group of groups) {
    const requests = Math.max(Number(group?.sum?.requests) || 0, 0);
    const action = normalizeAction(group?.dimensions?.actionType);
    if (CLASS_A_ACTIONS.has(action)) {
      totals.classAOperations += requests;
    } else if (CLASS_B_ACTIONS.has(action)) {
      totals.classBOperations += requests;
    } else if (FREE_ACTIONS.has(action)) {
      totals.freeOperations += requests;
    } else {
      // Desconhecidos entram na classe mais restritiva para falhar com seguranca.
      totals.classAOperations += requests;
      totals.unknownOperations += requests;
      if (group?.dimensions?.actionType) { unknownActions.add(group.dimensions.actionType); }
    }
  }

  return { ...totals, unknownActions: [...unknownActions].sort() };
}

function evaluateUsage(usage, limits = DEFAULT_LIMITS) {
  const metrics = [
    ['storageBytes', usage.storageBytes, limits.storageBytes],
    ['classAOperations', usage.classAOperations, limits.classAOperations],
    ['classBOperations', usage.classBOperations, limits.classBOperations],
  ].map(([name, value, limit]) => ({
    name,
    value: Number(value) || 0,
    limit,
    ratio: limit > 0 ? (Number(value) || 0) / limit : 1,
  }));

  const blocked = metrics.filter((metric) => metric.ratio >= 1);
  const warnings = metrics.filter((metric) => metric.ratio >= 0.75 && metric.ratio < 1);
  return {
    status: blocked.length ? 'blocked' : warnings.length ? 'warning' : 'ok',
    blocked: blocked.map((metric) => metric.name),
    warnings: warnings.map((metric) => metric.name),
    metrics,
  };
}

function analyticsConfigured(env = process.env) {
  return Boolean(env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID && env.R2_BUCKET);
}

async function fetchR2Usage({ env = process.env, fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  if (!analyticsConfigured(env)) {
    throw new Error('Monitor R2 requer CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID e R2_BUCKET');
  }
  if (typeof fetchImpl !== 'function') { throw new Error('fetch indisponivel para consultar o Cloudflare'); }

  const start = billingCycleStart(now, env.R2_BILLING_CYCLE_DAY || 12).toISOString();
  const end = now.toISOString();
  const query = `
    query R2Usage($accountTag: string!, $bucketName: string!, $startDate: Time!, $endDate: Time!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          operations: r2OperationsAdaptiveGroups(
            limit: 10000
            filter: { bucketName: $bucketName, datetime_geq: $startDate, datetime_leq: $endDate }
          ) {
            sum { requests }
            dimensions { actionType }
          }
          storage: r2StorageAdaptiveGroups(
            limit: 1
            filter: { bucketName: $bucketName, datetime_geq: $startDate, datetime_leq: $endDate }
            orderBy: [datetime_DESC]
          ) {
            max { objectCount uploadCount payloadSize metadataSize }
            dimensions { datetime }
          }
        }
      }
    }
  `;

  const response = await fetchImpl(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: {
        accountTag: env.CLOUDFLARE_ACCOUNT_ID,
        bucketName: env.R2_BUCKET,
        startDate: start,
        endDate: end,
      },
    }),
  });
  if (!response.ok) { throw new Error(`Cloudflare Analytics respondeu HTTP ${response.status}`); }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(`Cloudflare Analytics: ${payload.errors.map((error) => error.message).join('; ')}`);
  }
  const account = payload.data?.viewer?.accounts?.[0];
  if (!account) { throw new Error('Conta nao retornada pelo Cloudflare Analytics'); }

  const operations = classifyOperations(account.operations);
  const storage = account.storage?.[0];
  const storageBytes = (Number(storage?.max?.payloadSize) || 0) + (Number(storage?.max?.metadataSize) || 0);
  const usage = {
    bucket: env.R2_BUCKET,
    cycleStart: start,
    checkedAt: end,
    storageObservedAt: storage?.dimensions?.datetime || null,
    storageBytes,
    objectCount: Number(storage?.max?.objectCount) || 0,
    pendingMultipartUploads: Number(storage?.max?.uploadCount) || 0,
    ...operations,
  };
  return { usage, limits: limitsFromEnv(env), evaluation: evaluateUsage(usage, limitsFromEnv(env)) };
}

async function enforceR2UsageGuard(options = {}) {
  const env = options.env || process.env;
  if (!analyticsConfigured(env)) {
    if (String(env.R2_USAGE_GUARD_REQUIRED || '').toLowerCase() === 'true') {
      throw new Error('Disjuntor R2 obrigatorio, mas credenciais de Analytics estao incompletas');
    }
    return { skipped: true, reason: 'analytics_not_configured' };
  }
  const report = await fetchR2Usage(options);
  if (report.evaluation.status === 'blocked') {
    throw new Error(`Disjuntor R2 bloqueou a escrita: ${report.evaluation.blocked.join(', ')}`);
  }
  return { skipped: false, ...report };
}

module.exports = {
  DEFAULT_LIMITS,
  analyticsConfigured,
  billingCycleStart,
  classifyOperations,
  enforceR2UsageGuard,
  evaluateUsage,
  fetchR2Usage,
  limitsFromEnv,
};
