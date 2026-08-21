const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const winston = require('winston');

const auditLogDir = path.resolve(__dirname, '..', 'logs');
const auditLogPath = path.join(auditLogDir, 'rewrite-audit-YYYY-MM-DD.log');
const loggedPrompts = new Set();
const runUsageTotals = new Map();
let auditLogger = null;
let auditLoggerDate = '';
let cleanupTimer = null;

function readBoolean(value, fallback = false) {
  if (value == null || String(value).trim() === '') return fallback;
  return String(value).trim().toLowerCase() === 'true';
}

function readBoundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function getRewriteAuditConfig(env = process.env) {
  const enabled = readBoolean(env.REWRITE_AUDIT_LOG, false);
  const production = env.NODE_ENV === 'production';
  return Object.freeze({
    enabled,
    includeContent: enabled && !production && readBoolean(env.REWRITE_AUDIT_LOG_CONTENT, false),
    retentionDays: readBoundedNumber(env.REWRITE_AUDIT_RETENTION_DAYS, 3, 1, 30),
    cleanupIntervalHours: readBoundedNumber(env.REWRITE_AUDIT_CLEANUP_INTERVAL_HOURS, 6, 1, 24),
    maxFileBytes: readBoundedNumber(env.REWRITE_AUDIT_MAX_FILE_BYTES, 10 * 1024 * 1024, 1024 * 1024, 100 * 1024 * 1024),
    maxFiles: Math.trunc(readBoundedNumber(env.REWRITE_AUDIT_MAX_FILES, 10, 2, 30))
  });
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function normalizeRewriteUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const cacheMetricsAvailable = usage.prompt_cache_hit_tokens != null
    || usage.prompt_cache_miss_tokens != null;
  const promptTokens = nonNegativeInteger(usage.prompt_tokens);
  const promptCacheHitTokens = nonNegativeInteger(usage.prompt_cache_hit_tokens);
  const promptCacheMissTokens = cacheMetricsAvailable
    ? nonNegativeInteger(usage.prompt_cache_miss_tokens)
    : 0;
  const completionTokens = nonNegativeInteger(usage.completion_tokens);
  const reasoningTokens = nonNegativeInteger(
    usage.completion_tokens_details && usage.completion_tokens_details.reasoning_tokens
  );
  return {
    promptTokens,
    promptCacheHitTokens,
    promptCacheMissTokens,
    completionTokens,
    reasoningTokens,
    totalTokens: nonNegativeInteger(usage.total_tokens) || promptTokens + completionTokens,
    cacheMetricsAvailable,
    cacheHitRate: cacheMetricsAvailable && promptTokens > 0
      ? Number((promptCacheHitTokens / promptTokens).toFixed(6))
      : null
  };
}

const DEEPSEEK_PRICING_CNY_PER_MILLION = Object.freeze({
  'deepseek-v4-flash': Object.freeze({
    offPeak: { cacheHitInput: 0.05, cacheMissInput: 1.5, output: 4.5 },
    peak: { cacheHitInput: 0.1, cacheMissInput: 3, output: 9 }
  }),
  'deepseek-v4-pro': Object.freeze({
    offPeak: { cacheHitInput: 0.15, cacheMissInput: 4.5, output: 13.5 },
    peak: { cacheHitInput: 0.3, cacheMissInput: 9, output: 27 }
  })
});

function beijingHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    hourCycle: 'h23'
  }).format(date));
}

function estimateDeepSeekCostCny(model, usage, date = new Date()) {
  const normalized = normalizeRewriteUsage(usage);
  const pricing = DEEPSEEK_PRICING_CNY_PER_MILLION[String(model || '').toLowerCase()];
  if (!normalized || !pricing || !normalized.cacheMetricsAvailable) return null;
  const hour = beijingHour(date);
  const period = (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18) ? 'peak' : 'offPeak';
  const rates = pricing[period];
  const estimatedCostCny = (
    normalized.promptCacheHitTokens * rates.cacheHitInput
    + normalized.promptCacheMissTokens * rates.cacheMissInput
    + normalized.completionTokens * rates.output
  ) / 1000000;
  return {
    pricingPeriod: period,
    pricingTimeZone: 'Asia/Shanghai',
    pricingSnapshotDate: '2026-08-21',
    ratesCnyPerMillionTokens: rates,
    estimatedCostCny: Number(estimatedCostCny.toFixed(6))
  };
}

async function cleanupExpiredAuditLogs(config = getRewriteAuditConfig()) {
  if (!config.enabled) return 0;
  let entries;
  try {
    entries = await fs.promises.readdir(auditLogDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
  const cutoff = Date.now() - config.retentionDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !/^rewrite-audit-\d{4}-\d{2}-\d{2}(?:\d+)?\.log$/i.test(entry.name)) continue;
    const target = path.join(auditLogDir, entry.name);
    const stats = await fs.promises.stat(target);
    if (stats.mtimeMs >= cutoff) continue;
    await fs.promises.unlink(target);
    removed += 1;
  }
  return removed;
}

function getAuditLogger() {
  const config = getRewriteAuditConfig();
  if (!config.enabled) return null;
  const currentDate = new Date().toISOString().slice(0, 10);
  if (auditLogger && auditLoggerDate === currentDate) return auditLogger;
  if (auditLogger) auditLogger.close();
  fs.mkdirSync(auditLogDir, { recursive: true });
  auditLoggerDate = currentDate;
  auditLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.json()
    ),
    defaultMeta: { service: 'rewrite-audit' },
    transports: [new winston.transports.File({
      filename: path.join(auditLogDir, `rewrite-audit-${currentDate}.log`),
      maxsize: config.maxFileBytes,
      maxFiles: config.maxFiles
    })]
  });
  cleanupExpiredAuditLogs(config).catch(() => {});
  cleanupTimer = setInterval(() => cleanupExpiredAuditLogs(config).catch(() => {}), config.cleanupIntervalHours * 60 * 60 * 1000);
  cleanupTimer.unref();
  return auditLogger;
}

function beginRewriteAuditRun(details = {}) {
  const logger = getAuditLogger();
  if (!logger) return null;
  const runId = crypto.randomUUID();
  runUsageTotals.set(runId, {
    usageRequestCount: 0,
    usageMissingCount: 0,
    cacheMetricsRequestCount: 0,
    cacheMeasuredPromptTokens: 0,
    promptTokens: 0,
    promptCacheHitTokens: 0,
    promptCacheMissTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    estimatedCostCny: 0
  });
  logger.info('rewrite_run_start', { event: 'rewrite_run_start', runId, ...details });
  return runId;
}

function auditRewriteRequest(payload, details = {}) {
  const logger = getAuditLogger();
  if (!logger || !payload) return null;
  const config = getRewriteAuditConfig();
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const systemContent = String((messages.find((message) => message.role === 'system') || {}).content || '');
  const userContent = String((messages.find((message) => message.role === 'user') || {}).content || '');
  const runId = details.runId || 'standalone';
  const requestId = details.requestId || crypto.randomUUID();
  const systemPromptHash = sha256(systemContent);

  if (!loggedPrompts.has(runId)) {
    loggedPrompts.add(runId);
    logger.info('rewrite_system_prompt', {
      event: 'rewrite_system_prompt',
      runId,
      systemPromptHash,
      systemPromptLength: systemContent.length,
      ...(config.includeContent ? { systemPrompt: systemContent } : {})
    });
  }

  logger.info('rewrite_request', {
    event: 'rewrite_request',
    runId,
    requestId,
    phase: details.phase || 'primary',
    attempt: details.attempt || 1,
    sentenceIndex: details.sentenceIndex,
    groupIndex: details.groupIndex,
    groupPosition: details.groupPosition,
    contextCount: details.contextCount || 0,
    contextSource: details.contextCount ? 'rewritten_results' : 'none',
    model: payload.model,
    temperature: payload.temperature,
    topP: payload.top_p,
    thinking: payload.thinking && payload.thinking.type || 'disabled',
    reasoningEffort: payload.reasoning_effort || 'provider-default',
    stream: !!payload.stream,
    messageRoles: messages.map((message) => message.role),
    systemPromptHash,
    userContentLength: userContent.length,
    ...(config.includeContent ? { userContent } : {})
  });
  return requestId;
}

function auditRewriteUsage(usage, details = {}) {
  const logger = getAuditLogger();
  if (!logger) return;
  const runId = details.runId || 'standalone';
  const normalized = normalizeRewriteUsage(usage);
  if (!normalized) {
    const totals = runUsageTotals.get(runId);
    if (totals) totals.usageMissingCount += 1;
    logger.warn('rewrite_usage_missing', {
      event: 'rewrite_usage_missing',
      runId,
      requestId: details.requestId,
      phase: details.phase || 'primary',
      attempt: details.attempt || 1,
      sentenceIndex: details.sentenceIndex,
      groupIndex: details.groupIndex,
      groupPosition: details.groupPosition,
      model: details.model
    });
    return;
  }

  const cost = estimateDeepSeekCostCny(details.model, usage, details.timestamp || new Date());
  const totals = runUsageTotals.get(runId);
  if (totals) {
    totals.usageRequestCount += 1;
    if (normalized.cacheMetricsAvailable) {
      totals.cacheMetricsRequestCount += 1;
      totals.cacheMeasuredPromptTokens += normalized.promptTokens;
    }
    totals.promptTokens += normalized.promptTokens;
    totals.promptCacheHitTokens += normalized.promptCacheHitTokens;
    totals.promptCacheMissTokens += normalized.promptCacheMissTokens;
    totals.completionTokens += normalized.completionTokens;
    totals.reasoningTokens += normalized.reasoningTokens;
    totals.totalTokens += normalized.totalTokens;
    totals.estimatedCostCny += cost ? cost.estimatedCostCny : 0;
  }

  logger.info('rewrite_usage', {
    event: 'rewrite_usage',
    runId,
    requestId: details.requestId,
    phase: details.phase || 'primary',
    attempt: details.attempt || 1,
    sentenceIndex: details.sentenceIndex,
    groupIndex: details.groupIndex,
    groupPosition: details.groupPosition,
    model: details.model,
    ...normalized,
    ...(cost || {})
  });
}

function endRewriteAuditRun(runId, details = {}) {
  if (!runId) return;
  const logger = getAuditLogger();
  const totals = runUsageTotals.get(runId);
  if (totals) {
    totals.cacheHitRate = totals.cacheMeasuredPromptTokens > 0
      ? Number((totals.promptCacheHitTokens / totals.cacheMeasuredPromptTokens).toFixed(6))
      : null;
    totals.estimatedCostCny = Number(totals.estimatedCostCny.toFixed(6));
  }
  if (logger) logger.info('rewrite_run_end', {
    event: 'rewrite_run_end',
    runId,
    ...details,
    ...(totals || {})
  });
  loggedPrompts.delete(runId);
  runUsageTotals.delete(runId);
}

module.exports = {
  auditLogPath,
  getRewriteAuditConfig,
  cleanupExpiredAuditLogs,
  beginRewriteAuditRun,
  auditRewriteRequest,
  auditRewriteUsage,
  normalizeRewriteUsage,
  estimateDeepSeekCostCny,
  endRewriteAuditRun
};
