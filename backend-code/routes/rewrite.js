/**
 * AI降重路由
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, transaction } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const {
  academicPromptVariantForIndex,
  buildRewriteMessages,
  normalizeRewriteVersion
} = require('../services/rewrite-prompts');
const {
  logDeepSeekSelection
} = require('../services/ai-model-router');
const {
  getRewriteConfig,
  getRewriteProviderCycle,
  getRewriteProviderConfig,
  rewriteProviderSummary,
  buildRewritePayload
} = require('../services/rewrite-config');
const {
  groupRewriteTasks,
  buildChainedRewriteContext
} = require('../services/rewrite-groups');
const {
  beginRewriteAuditRun,
  auditRewriteRequest,
  auditRewriteUsage,
  endRewriteAuditRun
} = require('../services/rewrite-audit');

const router = express.Router();
const LOCAL_REWRITE_TEST_MODE = process.env.NODE_ENV !== 'production'
  && process.env.LOCAL_REWRITE_TEST_MODE === 'true';

router.get('/mode', (req, res) => {
  const rewriteConfig = getRewriteConfig();
  const providerCycle = getRewriteProviderCycle();
  res.json({
    code: 'SUCCESS',
    data: {
      localTestMode: LOCAL_REWRITE_TEST_MODE,
      rewriteConfig: {
        model: rewriteConfig.model,
        temperature: rewriteConfig.temperature,
        topP: rewriteConfig.topP,
        thinking: rewriteConfig.selection.thinking,
        reasoningEffort: rewriteConfig.selection.reasoningEffort || 'provider-default',
        batchMode: REWRITE_BATCH_MODE,
        providerRotation: providerCycle.length > 1,
        providerCycle: providerCycle.map(rewriteProviderSummary)
      }
    }
  });
});

router.use((req, res, next) => {
  if (LOCAL_REWRITE_TEST_MODE && req.path === '/stream' && req.method === 'POST') {
    req.user = { id: 0, phone: 'local-test', nickname: '本地测试' };
    return next();
  }
  return authenticateToken(req, res, next);
});

// Account concurrency can be 500 while the application deliberately keeps
// headroom for retries, multiple users, and other DeepSeek-backed features.
// This process-wide gate prevents several simultaneous document jobs from
// each opening their full worker pool independently.
const DEEPSEEK_GLOBAL_CONCURRENCY = Math.min(
  400,
  Math.max(1, Number.parseInt(process.env.DEEPSEEK_GLOBAL_CONCURRENCY || '128', 10) || 128)
);
const DEEPSEEK_REQUEST_TIMEOUT_MS = Math.min(
  10 * 60 * 1000,
  Math.max(15 * 1000, Number.parseInt(process.env.DEEPSEEK_REQUEST_TIMEOUT_MS || '120000', 10) || 120000)
);
const DEEPSEEK_RETRY_MAX = Math.min(
  5,
  Math.max(0, Number.parseInt(process.env.DEEPSEEK_RETRY_MAX || '2', 10) || 2)
);
const DEEPSEEK_RETRY_BASE_MS = Math.min(
  60 * 1000,
  Math.max(250, Number.parseInt(process.env.DEEPSEEK_RETRY_BASE_MS || '1000', 10) || 1000)
);
const DEEPSEEK_FALLBACK_TIMEOUT_MS = Math.min(
  10 * 60 * 1000,
  Math.max(15 * 1000, Number.parseInt(process.env.DEEPSEEK_FALLBACK_TIMEOUT_MS || '60000', 10) || 60000)
);
let activeDeepSeekRequests = 0;
const pendingDeepSeekRequests = [];

async function acquireDeepSeekSlot() {
  return new Promise((resolve) => {
    const grant = () => {
      activeDeepSeekRequests += 1;
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        activeDeepSeekRequests -= 1;
        const next = pendingDeepSeekRequests.shift();
        // Grant the next waiter synchronously before resolving it. This
        // prevents a third caller from observing a free slot and briefly
        // pushing active requests above the configured ceiling.
        if (next) next();
      });
    };
    if (activeDeepSeekRequests < DEEPSEEK_GLOBAL_CONCURRENCY && pendingDeepSeekRequests.length === 0) {
      grant();
    } else {
      pendingDeepSeekRequests.push(grant);
    }
  });
}


/**
 * @param {string} text
 * @param {(delta: string) => void} [onDelta] DeepSeek 流式文本增量，转发到前端展示
 */
function retryAfterMs(response) {
  const value = response && response.headers && response.headers.get('retry-after');
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

function isRetryableStatus(status) {
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(Number(status));
}

function createDeepSeekError(message, details = {}) {
  const error = new Error(message);
  Object.assign(error, details);
  return error;
}

function rewriteUnavailableMessage(fatalError) {
  const status = Number(fatalError && fatalError.status);
  const code = String(fatalError && fatalError.code || '');
  if (status === 402) return 'AI 服务余额不足，本次未生成降重结果，请充值后重新提交';
  if (status === 401 || status === 403) return 'AI 服务凭据无效或无权限，本次未生成降重结果';
  if (code === 'AI_NOT_CONFIGURED') return 'AI 降重服务未配置，本次未生成降重结果';
  return 'AI 降重服务不可用，本次未生成降重结果';
}

function throwIfAllRewriteTasksFailed(outcome) {
  if (!outcome || !(outcome.taskCount > 0 && outcome.failedCount >= outcome.taskCount)) return;
  throw createDeepSeekError(rewriteUnavailableMessage(outcome.fatalError), {
    code: outcome.fatalError && outcome.fatalError.code || 'REWRITE_ALL_TASKS_FAILED',
    status: outcome.fatalError && outcome.fatalError.status || null,
    retryable: false
  });
}

async function rewriteWithDeepSeek(text, onDelta, rewriteVersion = 'v1', options = {}) {
  const releaseSlot = await acquireDeepSeekSlot();
  const timeoutMs = Math.min(
    10 * 60 * 1000,
    Math.max(15 * 1000, Number.parseInt(options.timeoutMs || DEEPSEEK_REQUEST_TIMEOUT_MS, 10) || DEEPSEEK_REQUEST_TIMEOUT_MS)
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const providerConfig = getRewriteProviderConfig(options.providerRouteId);
    const apiKey = process.env[providerConfig.apiKeyEnv];
    const baseURL = providerConfig.apiBase;
    const selection = { ...providerConfig.selection, provider: providerConfig.provider, routeId: providerConfig.routeId };
    if (!apiKey) throw createDeepSeekError(`${providerConfig.provider} 降重服务未配置`, {
      retryable: false,
      code: 'AI_NOT_CONFIGURED',
      provider: providerConfig.provider,
      model: providerConfig.model
    });
    logDeepSeekSelection(logger, selection, { caller: 'rewriteWithDeepSeek' });

    let response;
    let requestPayload;
    let auditRequestId;
    try {
      requestPayload = buildRewritePayload({
        messages: buildRewriteMessages(text, options.context),
        stream: true,
        providerConfig
      });
      auditRequestId = auditRewriteRequest(requestPayload, {
        ...options.audit,
        provider: providerConfig.provider,
        routeId: providerConfig.routeId
      });
      response = await fetch(baseURL + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + apiKey
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal
      });
    } catch (error) {
      const timedOut = controller.signal.aborted;
      throw createDeepSeekError(
        timedOut ? `${providerConfig.provider} 请求超过 ${Math.round(timeoutMs / 1000)} 秒` : `${providerConfig.provider} 网络请求失败`,
        { code: timedOut ? 'DEEPSEEK_TIMEOUT' : 'DEEPSEEK_NETWORK_ERROR', retryable: true, provider: providerConfig.provider, model: providerConfig.model }
      );
    }

    if (!response.ok) {
      const detail = await response.text();
      const retryable = isRetryableStatus(response.status);
      logger.warn(`${providerConfig.provider} API调用失败: HTTP ${response.status} ${detail.slice(0, 300)}`);
      throw createDeepSeekError(`${providerConfig.provider} 降重请求失败`, {
        code: 'DEEPSEEK_HTTP_ERROR',
        status: response.status,
        retryable,
        retryAfterMs: retryAfterMs(response),
        provider: providerConfig.provider,
        model: providerConfig.model
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let result = '';
    let responseUsage = null;
    let responseModel = requestPayload.model;

  function consumeLine(line) {
    const value = line.trim();
    if (!value.startsWith('data:')) return;
    const data = value.slice(5).trim();
    if (!data || data === '[DONE]') return;
    try {
      const payload = JSON.parse(data);
      if (payload.usage) responseUsage = payload.usage;
      if (payload.model) responseModel = payload.model;
      const delta = payload && payload.choices && payload.choices[0] && payload.choices[0].delta
        ? payload.choices[0].delta.content
        : '';
      if (delta) {
        result += delta;
        if (onDelta) onDelta(delta);
      }
    } catch (error) {
      logger.warn(`忽略无法解析的${providerConfig.provider}流式片段`);
    }
  }

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        lines.forEach(consumeLine);
      }
      buffer += decoder.decode();
      if (buffer.trim()) consumeLine(buffer);
      auditRewriteUsage(responseUsage, {
        ...options.audit,
        requestId: auditRequestId,
        model: responseModel,
        provider: providerConfig.provider,
        routeId: providerConfig.routeId
      });
    } catch (error) {
      const timedOut = controller.signal.aborted;
      throw createDeepSeekError(
        timedOut ? `${providerConfig.provider} 请求超过 ${Math.round(timeoutMs / 1000)} 秒` : `${providerConfig.provider} 流式响应中断`,
        { code: timedOut ? 'DEEPSEEK_TIMEOUT' : 'DEEPSEEK_STREAM_ERROR', retryable: true, provider: providerConfig.provider, model: providerConfig.model }
      );
    }

    return result.trim();
  } finally {
    clearTimeout(timeout);
    releaseSlot();
  }
}

function extractMessageContent(payload) {
  const content = payload && payload.choices && payload.choices[0] && payload.choices[0].message
    ? payload.choices[0].message.content
    : '';
  if (Array.isArray(content)) {
    return content.map((part) => part && (part.text || part.content || '')).join('');
  }
  return typeof content === 'string' ? content : '';
}

// Final transport fallback for document mode: after streamed attempts fail,
// make one bounded non-stream request. It may use a separately configured
// model, but defaults to the same model so deployments need no extra setup.
async function rewriteWithDeepSeekFallback(text, rewriteVersion = 'v1', context = {}) {
  const releaseSlot = await acquireDeepSeekSlot();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEEPSEEK_FALLBACK_TIMEOUT_MS);
  try {
    const providerConfig = getRewriteProviderConfig(context.providerRouteId);
    const apiKey = process.env[providerConfig.apiKeyEnv];
    const baseURL = providerConfig.apiBase;
    const selection = { ...providerConfig.selection, provider: providerConfig.provider, routeId: providerConfig.routeId };
    if (!apiKey) throw createDeepSeekError(`${providerConfig.provider} 降重服务未配置`, {
      retryable: false,
      code: 'AI_NOT_CONFIGURED',
      provider: providerConfig.provider,
      model: providerConfig.model
    });
    logDeepSeekSelection(logger, selection, { caller: 'rewriteWithDeepSeekFallback' });
    let response;
    let requestPayload;
    let auditRequestId;
    try {
      requestPayload = buildRewritePayload({
        messages: buildRewriteMessages(text, context),
        stream: false,
        providerConfig
      });
      auditRequestId = auditRewriteRequest(requestPayload, {
        ...context.audit,
        phase: 'fallback',
        provider: providerConfig.provider,
        routeId: providerConfig.routeId
      });
      response = await fetch(baseURL + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + apiKey
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal
      });
    } catch (error) {
      throw createDeepSeekError(
        controller.signal.aborted ? `${providerConfig.provider} fallback 请求超时` : `${providerConfig.provider} fallback 网络请求失败`,
        { code: controller.signal.aborted ? 'DEEPSEEK_FALLBACK_TIMEOUT' : 'DEEPSEEK_FALLBACK_NETWORK_ERROR', retryable: false, provider: providerConfig.provider, model: providerConfig.model }
      );
    }
    if (!response.ok) {
      const detail = await response.text();
      logger.warn(`${providerConfig.provider} fallback 调用失败: HTTP ${response.status} ${detail.slice(0, 300)}`);
      throw createDeepSeekError(`${providerConfig.provider} fallback 请求失败`, {
        code: 'DEEPSEEK_FALLBACK_HTTP_ERROR',
        status: response.status,
        retryable: false,
        provider: providerConfig.provider,
        model: providerConfig.model
      });
    }
    const responsePayload = await response.json();
    auditRewriteUsage(responsePayload.usage, {
      ...context.audit,
      phase: 'fallback',
      requestId: auditRequestId,
      model: responsePayload.model || requestPayload.model,
      provider: providerConfig.provider,
      routeId: providerConfig.routeId
    });
    const rewritten = extractMessageContent(responsePayload).trim();
    if (!rewritten) {
      throw createDeepSeekError('DeepSeek fallback 返回空结果', {
        code: 'DEEPSEEK_FALLBACK_EMPTY_OUTPUT',
        retryable: false
      });
    }
    return rewritten;
  } finally {
    clearTimeout(timeout);
    releaseSlot();
  }
}

const SHORT_HEADING_MAX_CONTENT_LENGTH = 14;

function isHeading(para, { firstContentParagraph = false } = {}) {
  const text = String(para || '').trim();
  if (!text) return false;
  // A colon, semicolon or comma normally means this line is an introduction,
  // list item or compact statement rather than a heading. The old rule treated
  // every line without 。！？ as a heading, which skipped pasted web articles
  // such as “爆发的三大成熟条件同时到来：” and numbered statements ending in ；.
  if (/[\u3002\uff01\uff1f!?\uff0c,\uff1b;\uff1a:]/u.test(text)) return false;

  // Preserve conventional academic section headings even when they are
  // longer than a short label. A simple “1.” list item is deliberately not
  // included here; only multi-level numbering such as 4.2 or 4.2.1 qualifies.
  if (/^(?:第[一二三四五六七八九十百0-9]+[章节篇部]|(?:\d+\.)+\d+\s*\S)/u.test(text)) return true;
  if (/^(?:摘\s*要|关键词|Abstract|References|参考文献|致谢|附录)$/iu.test(text)) return true;

  // A document's first clean line is commonly its title. Pasted article titles
  // containing clause punctuation have already been rejected above.
  if (firstContentParagraph && effectiveContentLength(text) <= 40) return true;

  // For all other lines, only a genuinely short label is considered a title.
  // Longer standalone statements without terminal punctuation are rewritten.
  return effectiveContentLength(text) <= SHORT_HEADING_MAX_CONTENT_LENGTH;
}

const SENTENCE_END_PUNCTUATION = /[\u3002\uff01\uff1f!?]/u;
const SENTENCE_CLOSERS = /[\u201d\u2019"'\u300f\u300d\u300b\u3009\u3011\u3015\uff09)\]]/u;
const TERMINAL_SUFFIX = /([\u3002\uff01\uff1f!?])(?:[\u201d\u2019"'\u300f\u300d\u300b\u3009\u3011\u3015\uff09)\]]*)$/u;

function normalizeDuplicateTerminalPunctuation(text) {
  return String(text || '').replace(
    /([\u3002\uff01\uff1f!?])([\u201d\u2019"'\u300f\u300d\u300b\u3009\u3011\u3015\uff09)\]]+)([\u3002\uff01\uff1f!?]+)$/u,
    (matched, innerTerminal, closers, outerTerminals) => {
      const family = (terminal) => {
        if (terminal === '\uff01' || terminal === '!') return '!';
        if (terminal === '\uff1f' || terminal === '?') return '?';
        return terminal;
      };
      return [...outerTerminals].every((terminal) => family(terminal) === family(innerTerminal))
        ? innerTerminal + closers
        : matched;
    }
  );
}

function splitParagraphSentences(paragraph) {
  const parts = [];
  let start = 0;
  for (let index = 0; index < paragraph.length; index += 1) {
    if (!SENTENCE_END_PUNCTUATION.test(paragraph[index])) continue;
    let end = index + 1;
    while (end < paragraph.length && SENTENCE_CLOSERS.test(paragraph[end])) end += 1;
    // Keep terminals after a closing quote in the same slice. The normalizer
    // removes same-kind duplicates such as `。"。`, while preserving an
    // intentional mixed ending such as `？"！`.
    if (end > index + 1) {
      while (end < paragraph.length && SENTENCE_END_PUNCTUATION.test(paragraph[end])) end += 1;
    }
    const sentence = normalizeDuplicateTerminalPunctuation(paragraph.slice(start, end).trim());
    if (sentence) parts.push(sentence);
    start = end;
    index = end - 1;
  }
  const remainder = normalizeDuplicateTerminalPunctuation(paragraph.slice(start).trim());
  if (remainder) parts.push(remainder);
  return parts;
}

function splitSentences(text) {
  const sentences = [];
  const paragraphs = text.split(/\r\n|\n/);
  let hasContent = false;
  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const para = paragraphs[pIdx].trim();
    if (!para) continue;
    const firstContentParagraph = !hasContent;
    hasContent = true;
    if (isHeading(para, { firstContentParagraph })) { sentences.push({ text: para, pIdx, isTitle: true }); continue; }
    const parts = splitParagraphSentences(para);
    for (const part of parts) { const s = part.trim(); if (s) sentences.push({ text: s, pIdx, isTitle: false }); }
  }
  return sentences;
}

function buildResultOrder(sentences, options = {}) {
  return sentences.map((_, index) => index);
}

function assembleParagraphs(sentences, results, options = {}) {
  const paraMap = new Map();
  const resultOrder = buildResultOrder(sentences, options);
  for (const i of resultOrder) {
    const { pIdx } = sentences[i];
    if (!paraMap.has(pIdx)) paraMap.set(pIdx, []);
    paraMap.get(pIdx).push(results[i]);
  }
  const paragraphEntries = Array.from(paraMap.keys())
    .sort((a, b) => a - b)
    .map((pIdx) => ({
      pIdx,
      text: paraMap.get(pIdx).join('').trim()
    }))
    .filter((entry) => entry.text);
  let output = '';
  for (let i = 0; i < paragraphEntries.length; i++) {
    const entry = paragraphEntries[i];
    if (i > 0) {
      const previous = paragraphEntries[i - 1];
      output += '\n'.repeat(Math.max(1, entry.pIdx - previous.pIdx));
    }
    output += entry.text;
  }
  return output.trim();
}

function ensureEndPunct(original, rewritten) {
  if (!rewritten) return rewritten;
  // One source sentence owns one output slot. Remove model-introduced line
  // breaks so grouping/concurrency can never create extra paragraphs.
  const cleaned = normalizeDuplicateTerminalPunctuation(rewritten.replace(/[\r\n]+/g, '').trim());
  if (!cleaned) return original.trim();
  const originalTerminal = original.trim().match(TERMINAL_SUFFIX);
  if (originalTerminal && !TERMINAL_SUFFIX.test(cleaned)) return cleaned + originalTerminal[1];
  return cleaned;
}

// Five effective sentences form one serial chain. Chains run concurrently so
// each sentence can consume the previous rewritten result without turning the
// whole document into one long serial job.
const REWRITE_GROUP_SIZE = Math.min(
  16,
  Math.max(1, Number.parseInt(process.env.REWRITE_GROUP_SIZE || '5', 10) || 5)
);
const REWRITE_CONCURRENCY = Math.min(
  DEEPSEEK_GLOBAL_CONCURRENCY,
  Math.max(1, Number.parseInt(process.env.REWRITE_GROUP_CONCURRENCY || '128', 10) || 128)
);
const REWRITE_INITIAL_CONCURRENCY = Math.min(
  REWRITE_CONCURRENCY,
  Math.max(1, Number.parseInt(process.env.REWRITE_GROUP_INITIAL_CONCURRENCY || '16', 10) || 16)
);
const REWRITE_MIN_CONCURRENCY = Math.min(
  REWRITE_INITIAL_CONCURRENCY,
  Math.max(1, Number.parseInt(process.env.REWRITE_GROUP_MIN_CONCURRENCY || '4', 10) || 4)
);
const REWRITE_BATCH_MODE = String(process.env.REWRITE_BATCH_MODE || 'sentence').trim().toLowerCase();
const REWRITE_BATCH_ENABLED = REWRITE_BATCH_MODE === 'group';

function effectiveContentLength(text) {
  return ((text || '').match(/[\p{L}\p{N}]/gu) || []).length;
}

function shouldRewriteSentence(sentObj) {
  return !sentObj.isTitle && effectiveContentLength(sentObj.text) >= 6;
}

async function rewriteSentences(sentences, {
  onDelta,
  onResult,
  rewriteVersion = 'v1',
  concurrency = REWRITE_CONCURRENCY,
  adaptiveConcurrency = true,
  initialConcurrency = REWRITE_INITIAL_CONCURRENCY,
  minConcurrency = REWRITE_MIN_CONCURRENCY,
  maxRetries = adaptiveConcurrency ? DEEPSEEK_RETRY_MAX : 0
} = {}) {
  const results = sentences.map((sentObj) => sentObj.text);
  const tasks = [];
  const providerCycle = getRewriteProviderCycle();
  let failedCount = 0;
  let successfulCount = 0;
  let retriedCount = 0;
  let fallbackCount = 0;
  let fallbackRecoveredCount = 0;
  let fatalError = null;
  const providerFatalErrors = new Map();
  const providerRouteIds = new Set(providerCycle.map((config) => config.routeId));
  const settledTaskIndexes = new Set();

  for (let idx = 0; idx < sentences.length; idx++) {
    if (!shouldRewriteSentence(sentences[idx])) continue;
    const providerConfig = providerCycle[tasks.length % providerCycle.length];
    tasks.push({
      idx,
      sentObj: sentences[idx],
      sourceIndex: Number.isInteger(sentences[idx].sourceIndex) ? sentences[idx].sourceIndex : idx,
      promptVariant: academicPromptVariantForIndex(),
      providerRouteId: providerConfig.routeId,
      provider: providerConfig.provider,
      model: providerConfig.model
    });
  }
  const groups = groupRewriteTasks(tasks, REWRITE_GROUP_SIZE);
  logger.info('AI降重任务拆分完成', {
    model: getRewriteConfig().model,
    rewriteVersion,
    requestMode: REWRITE_BATCH_ENABLED ? 'five-sentences-per-request-experimental' : 'one-sentence-per-request',
    sentenceUnits: sentences.length,
    requestCount: REWRITE_BATCH_ENABLED ? groups.length : tasks.length,
    skippedCount: sentences.length - tasks.length,
    providerCycle: providerCycle.map((config) => `${config.provider}:${config.model}`)
  });
  const auditRunId = beginRewriteAuditRun({
    model: getRewriteConfig().model,
    temperature: getRewriteConfig().temperature,
    topP: getRewriteConfig().topP,
    thinking: getRewriteConfig().selection.thinking,
    reasoningEffort: getRewriteConfig().selection.reasoningEffort || 'provider-default',
    rewriteVersion,
    groupSize: REWRITE_GROUP_SIZE,
    groupCount: groups.length,
    sentenceUnits: sentences.length,
    requestCount: REWRITE_BATCH_ENABLED ? groups.length : tasks.length,
    skippedCount: sentences.length - tasks.length,
    providerCycle: providerCycle.map(rewriteProviderSummary)
  });

  const workerCeiling = Math.min(
    256,
    Math.max(1, Number.parseInt(concurrency, 10) || REWRITE_CONCURRENCY)
  );
  const workerFloor = adaptiveConcurrency
    ? Math.min(workerCeiling, Math.max(1, Number.parseInt(minConcurrency, 10) || 1))
    : workerCeiling;
  let currentLimit = adaptiveConcurrency
    ? Math.min(workerCeiling, Math.max(workerFloor, Number.parseInt(initialConcurrency, 10) || workerFloor))
    : workerCeiling;
  const retryLimit = Math.min(5, Math.max(0, Number.parseInt(maxRetries, 10) || 0));
  const increaseStep = Math.max(1, Math.ceil(workerCeiling / 32));
  let successStreak = 0;
  let lastDecreaseAt = 0;
  let minimumObserved = currentLimit;
  let maximumObserved = currentLimit;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function retryDelay(error, attempt) {
    const exponential = Math.min(30000, DEEPSEEK_RETRY_BASE_MS * Math.pow(2, attempt));
    const jitter = Math.floor(Math.random() * Math.max(100, exponential * 0.25));
    return Math.max(Number(error && error.retryAfterMs) || 0, exponential + jitter);
  }

  function safeErrorSummary(error) {
    if (!error) return null;
    const status = error.status == null ? null : Number(error.status);
    return {
      code: error.code || 'DEEPSEEK_FATAL_ERROR',
      status: Number.isInteger(status) ? status : null,
      message: error.message || 'AI 降重服务不可用',
      provider: error.provider || null,
      model: error.model || null
    };
  }

  function isFatalRewriteError(error) {
    if (!error) return false;
    const status = Number(error.status);
    if (Number.isInteger(status) && status >= 400 && status < 500 && !isRetryableStatus(status)) return true;
    return ['AI_NOT_CONFIGURED', 'DOCUMENT_REWRITE_AI_NOT_CONFIGURED'].includes(String(error.code || ''));
  }

  function registerFatalError(error, providerRouteId = null) {
    if (!isFatalRewriteError(error)) return false;
    const routeId = providerRouteId || error.routeId || (
      error.provider === 'glm' ? `glm:${error.model || ''}` : 'deepseek'
    );
    providerFatalErrors.set(routeId, safeErrorSummary(error));
    if (!fatalError && providerFatalErrors.size >= providerRouteIds.size) {
      fatalError = safeErrorSummary(error);
    }
    return true;
  }

  function settleTask(task, rewritten, failed, metadata = {}, error = null) {
    if (!task || settledTaskIndexes.has(task.idx)) return false;
    settledTaskIndexes.add(task.idx);
    if (failed) {
      results[task.idx] = task.sentObj.text;
      failedCount += 1;
      fallbackCount += 1;
    } else {
      results[task.idx] = ensureEndPunct(task.sentObj.text, rewritten);
      successfulCount += 1;
    }
    if (onResult) onResult(results[task.idx], task.idx, task.sentObj, failed, {
      ...metadata,
      fatal: !!(failed && fatalError),
      error: failed ? safeErrorSummary(error) : null
    });
    return true;
  }

  function failTasks(tasksToFail, error, metadata = {}) {
    const registeredFatal = registerFatalError(error, tasksToFail[0] && tasksToFail[0].providerRouteId);
    for (const task of tasksToFail) {
      settleTask(task, task.sentObj.text, true, {
        attempts: 0,
        fallback: true,
        recoveredByFallback: false,
        promptVariant: task.promptVariant,
        concurrency: currentLimit,
        ...metadata,
        fatal: registeredFatal || !!fatalError
      }, error);
    }
  }

  async function executeTask(task, reportPressure, previousTasks = [], groupIndex = null, groupPosition = null) {
    const { idx, sentObj, promptVariant, providerRouteId, provider, model } = task;
    const providerFatalError = providerFatalErrors.get(providerRouteId);
    if (fatalError || providerFatalError) {
      const error = fatalError || providerFatalError;
      failTasks([task], error, { groupIndex, groupPosition, skippedAfterFatal: true });
      return { failed: true, pressure: false, skipIncrease: true, attempts: 0, error };
    }
    const context = buildChainedRewriteContext(sentences, results, task, previousTasks);
    let lastError = null;
    let attempts = 0;
    let pressure = false;

    for (let attempt = 0; attempt <= retryLimit; attempt++) {
      attempts += 1;
      try {
        const rewritten = await rewriteWithDeepSeek(sentObj.text, (delta) => {
          if (delta && onDelta) onDelta(delta, idx, sentObj);
        }, rewriteVersion, {
          context,
          providerRouteId,
          audit: {
            runId: auditRunId,
            phase: 'primary',
            attempt: attempt + 1,
            sentenceIndex: idx,
            groupIndex,
            groupPosition,
            promptVariant,
            contextCount: context.previousRewrittenSentences.length,
            provider,
            routeId: providerRouteId,
            model
          }
        });
        if (!rewritten) {
          throw createDeepSeekError('DeepSeek 返回内容不可用', {
            code: 'DEEPSEEK_EMPTY_OUTPUT',
            retryable: true
          });
        }
        settleTask(task, rewritten, false, {
          attempts,
          fallback: false,
          recoveredByFallback: false,
          promptVariant,
          provider,
          providerRouteId,
          model,
          concurrency: currentLimit,
          groupIndex,
          groupPosition
        });
        if (attempts > 1) retriedCount += 1;
        return { failed: false, pressure, attempts };
      } catch (error) {
        lastError = error;
        const attemptPressure = error.status === 429 || error.status === 503
          || error.code === 'DEEPSEEK_TIMEOUT' || error.code === 'DEEPSEEK_NETWORK_ERROR'
          || error.code === 'DEEPSEEK_STREAM_ERROR';
        pressure = pressure || attemptPressure;
        if (attemptPressure && reportPressure) reportPressure();
        registerFatalError(error, providerRouteId);
        if (attempt >= retryLimit || error.retryable === false) break;
        await sleep(retryDelay(error, attempt));
      }
    }

    if (adaptiveConcurrency && (!lastError || lastError.retryable !== false)) {
      try {
        attempts += 1;
        const fallbackText = await rewriteWithDeepSeekFallback(sentObj.text, rewriteVersion, {
          ...context,
          providerRouteId,
          audit: {
            runId: auditRunId,
            phase: 'fallback',
            attempt: attempts,
            sentenceIndex: idx,
            groupIndex,
            groupPosition,
            promptVariant,
            contextCount: context.previousRewrittenSentences.length,
            provider,
            routeId: providerRouteId,
            model
          }
        });
        if (!fallbackText) {
          throw createDeepSeekError('DeepSeek fallback 返回内容不可用', {
            code: 'DEEPSEEK_FALLBACK_EMPTY_OUTPUT',
            retryable: false
          });
        }
        settleTask(task, fallbackText, false, {
          attempts,
          fallback: false,
          recoveredByFallback: true,
          promptVariant,
          provider,
          providerRouteId,
          model,
          concurrency: currentLimit,
          groupIndex,
          groupPosition
        });
        retriedCount += 1;
        fallbackRecoveredCount += 1;
        return { failed: false, pressure: false, skipIncrease: pressure, attempts, recoveredByFallback: true };
      } catch (fallbackError) {
        lastError = fallbackError;
        registerFatalError(fallbackError, providerRouteId);
      }
    }

    settleTask(task, sentObj.text, true, {
      attempts,
      fallback: true,
      recoveredByFallback: false,
      promptVariant,
      provider,
      providerRouteId,
      model,
      concurrency: currentLimit,
      groupIndex,
      groupPosition
    }, lastError);
    logger.warn('单句降重失败，已回退原文', {
      code: lastError && lastError.code || null,
      status: lastError && lastError.status || null,
      attempts,
      promptVariant,
      textLength: sentObj.text.length
    });
    return { failed: true, pressure: false, skipIncrease: true, attempts, error: lastError };
  }

  if (!tasks.length) {
    const emptyOutcome = {
      results,
      taskCount: 0,
      successfulCount: 0,
      failedCount,
      retriedCount,
      fallbackCount,
      fallbackRecoveredCount,
      fatalError: null,
      concurrency: { adaptive: adaptiveConcurrency, min: 0, max: 0, final: 0 }
    };
    endRewriteAuditRun(auditRunId, { ...emptyOutcome, results: undefined });
    return emptyOutcome;
  }

  function parseBatchRewriteOutput(output, expectedCount) {
    const normalized = String(output || '').replace(/```[\s\S]*?\n?|```/g, '').trim();
    const lines = normalized.split(/\r?\n/).map((line) => line
      .replace(/^\s*(?:\d+[.、)）]|[-*])\s*/u, '')
      .replace(/^【|】$/g, '')
      .trim()).filter(Boolean);
    return lines.length === expectedCount ? lines : null;
  }

  async function executeBatchGroup(group, reportPressure, groupIndex) {
    if (fatalError) {
      failTasks(group, fatalError, { groupIndex, batch: true, skippedAfterFatal: true });
      return { failed: true, pressure: false, skipIncrease: true, attempts: 0 };
    }
  const batchTexts = group.map((task) => task.sentObj.text);
    const firstTask = group[0];
    const batchContext = { batchTexts, promptVariant: firstTask.promptVariant };
    let lastError = null;
    let attempts = 0;
    for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
      attempts += 1;
      try {
        const output = await rewriteWithDeepSeek('', null, rewriteVersion, {
          context: batchContext,
          providerRouteId: firstTask.providerRouteId,
          audit: {
            runId: auditRunId,
            phase: 'primary-batch',
            attempt: attempt + 1,
            sentenceIndex: firstTask.idx,
            groupIndex,
            groupPosition: null,
            contextCount: 0,
            batchCount: group.length,
            provider: firstTask.provider,
            routeId: firstTask.providerRouteId,
            model: firstTask.model
          }
        });
        const rewrittenLines = parseBatchRewriteOutput(output, group.length);
        if (!rewrittenLines) throw createDeepSeekError('批量降重返回句数不匹配', { code: 'DEEPSEEK_BATCH_SHAPE_ERROR', retryable: true });
        group.forEach((task, index) => {
          settleTask(task, rewrittenLines[index], false, {
            attempts,
            fallback: false,
            recoveredByFallback: false,
            promptVariant: task.promptVariant,
            concurrency: currentLimit,
            batch: true,
            batchSize: group.length
          });
        });
        if (attempts > 1) retriedCount += 1;
        return { failed: false, pressure: false, skipIncrease: false, attempts };
      } catch (error) {
        lastError = error;
        if (error.status === 429 || error.status === 503 || error.code === 'DEEPSEEK_TIMEOUT'
          || error.code === 'DEEPSEEK_NETWORK_ERROR' || error.code === 'DEEPSEEK_STREAM_ERROR') {
          reportPressure();
        }
        registerFatalError(error);
        if (attempt >= retryLimit || error.retryable === false) break;
        await sleep(retryDelay(error, attempt));
      }
    }
    if (lastError && lastError.retryable === false) {
      failTasks(group, lastError, { groupIndex, batch: true, batchSize: group.length });
      return { failed: true, pressure: false, skipIncrease: true, attempts };
    }
    // Experimental mode is fail-safe: if a batch cannot be parsed, preserve
    // the original sentence-by-sentence implementation for this group.
    let failed = false;
    const previousTasks = [];
    for (let position = 0; position < group.length; position += 1) {
      const task = group[position];
      const outcome = await executeTask(task, reportPressure, previousTasks, groupIndex, position);
      failed = failed || outcome.failed;
      if (!outcome.failed) previousTasks.push(task);
    }
    if (lastError) retriedCount += 1;
    return { failed, pressure: true, skipIncrease: true, attempts };
  }

  let nextGroup = 0;
  let active = 0;
  let settled = 0;

  await new Promise((resolve) => {
    function tune(outcome) {
      const now = Date.now();
      if (adaptiveConcurrency && outcome.pressure && now - lastDecreaseAt >= 2000) {
        currentLimit = Math.max(workerFloor, Math.floor(currentLimit * 0.6));
        lastDecreaseAt = now;
        successStreak = 0;
      } else if (adaptiveConcurrency && !outcome.failed && !outcome.skipIncrease) {
        successStreak += 1;
        if (successStreak >= 8 && currentLimit < workerCeiling) {
          currentLimit = Math.min(workerCeiling, currentLimit + increaseStep);
          successStreak = 0;
        }
      }
      minimumObserved = Math.min(minimumObserved, currentLimit);
      maximumObserved = Math.max(maximumObserved, currentLimit);
    }

    function launch() {
      while (active < currentLimit && nextGroup < groups.length) {
        const groupIndex = nextGroup;
        const group = groups[nextGroup++];
        active += 1;
        (async () => {
          const previousTasks = [];
          let groupPressure = false;
          let groupFailed = false;
          let groupSkipIncrease = false;
          const sameProvider = new Set(group.map((task) => task.providerRouteId)).size === 1;
          if (REWRITE_BATCH_ENABLED && group.length > 1 && sameProvider) {
            const batchOutcome = await executeBatchGroup(group, () => {
              groupPressure = true;
              tune({ pressure: true, failed: false, skipIncrease: true });
            }, groupIndex);
            groupFailed = batchOutcome.failed;
            groupSkipIncrease = batchOutcome.skipIncrease;
          } else for (let groupPosition = 0; groupPosition < group.length; groupPosition++) {
            const task = group[groupPosition];
            const outcome = await executeTask(task, () => {
              groupPressure = true;
              tune({ pressure: true, failed: false, skipIncrease: true });
            }, previousTasks, groupIndex, groupPosition);
            groupPressure = groupPressure || outcome.pressure;
            groupFailed = groupFailed || outcome.failed;
            groupSkipIncrease = groupSkipIncrease || outcome.skipIncrease;
            if (outcome.failed) previousTasks.length = 0;
            else {
              previousTasks.push(task);
              if (previousTasks.length > 2) previousTasks.shift();
            }
          }
          return { failed: groupFailed, pressure: groupPressure, skipIncrease: groupSkipIncrease };
        })().then((outcome) => {
          tune(outcome);
        }).finally(() => {
          active -= 1;
          settled += 1;
          if (settled >= groups.length) resolve();
          else launch();
        });
      }
    }

    launch();
  });

  for (const task of tasks) {
    if (!settledTaskIndexes.has(task.idx)) {
      const unsettledError = fatalError || createDeepSeekError('AI 降重任务未返回结果', {
        code: 'DEEPSEEK_UNSETTLED_TASK',
        retryable: false
      });
      failTasks([task], unsettledError, { unsettled: true });
    }
  }

  const outcome = {
    results,
    taskCount: tasks.length,
    successfulCount,
    failedCount,
    retriedCount,
    fallbackCount,
    fallbackRecoveredCount,
    // If every task failed but only one provider was exercised (for example,
    // a one-sentence request), preserve that provider's actionable error
    // instead of replacing it with a generic all-tasks-failed message.
    fatalError: fatalError || (
      failedCount >= tasks.length && providerFatalErrors.size
        ? providerFatalErrors.values().next().value
        : null
    ),
    concurrency: {
      adaptive: adaptiveConcurrency,
      min: minimumObserved,
      max: maximumObserved,
      final: currentLimit,
      ceiling: workerCeiling
    }
  };
  endRewriteAuditRun(auditRunId, {
    failedCount,
    taskCount: tasks.length,
    successfulCount,
    retriedCount,
    fallbackCount,
    fallbackRecoveredCount,
    fatalError,
    concurrency: outcome.concurrency
  });
  return outcome;
}

async function finalizeOrder(userId, orderId, rewrittenText, wordCount, creditsCost) {
  await transaction(async (connection) => {
    await connection.execute(
      'UPDATE user_credits SET credits = credits - ?, total_consumed = total_consumed + ? WHERE user_id = ?',
      [creditsCost, creditsCost, userId]
    );
    const [newCredit] = await connection.execute('SELECT credits FROM user_credits WHERE user_id = ?', [userId]);
    await connection.execute(
      'INSERT INTO credit_transactions (user_id, type, amount, balance_after, source, description) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, 'consume', creditsCost, newCredit[0].credits, 'ai_rewrite', 'AI降重：' + wordCount + '字']
    );
    const docTitle = 'AI降重_' + new Date().toLocaleDateString('zh-CN');
    await connection.execute(
      'INSERT INTO documents (user_id, title, content, type, field, word_count, credits_cost) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, docTitle, rewrittenText, 'AI降重', '', rewrittenText.length, creditsCost]
    );
    await connection.execute(
      'INSERT INTO notifications (user_id, category, title, content) VALUES (?, ?, ?, ?)',
      [userId, 'AI降重', '降重完成', wordCount + '字降重完成']
    );
    if (orderId) {
      await connection.execute(
        'UPDATE orders SET status = ?, result_content = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['completed', rewrittenText, orderId]
      );
    }
  });
}
router.post('/stream', [
  body('originalText').notEmpty().withMessage('原文不能为空'),
  body('rewriteLevel').optional().isInt({ min: 1, max: 3 }),
  body('rewriteVersion').optional().isIn(['v1', 'v2', 'v3'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: '参数验证失败', code: 'VALIDATION_ERROR' });
  const userId = req.user.id;
  const { originalText, rewriteLevel = 2 } = req.body;
  const rewriteVersion = normalizeRewriteVersion(req.body.rewriteVersion);
  const wordCount = originalText.length;
  const creditsCost = Math.ceil(wordCount / 1000 * 18);
  if (!LOCAL_REWRITE_TEST_MODE) {
    const creditRows = await query('SELECT credits FROM user_credits WHERE user_id = ?', [userId]);
    const creditResult = creditRows[0];
    if (!creditResult || creditResult.credits < creditsCost) {
      return res.status(400).json({ error: '积分不足', code: 'INSUFFICIENT_CREDITS',
        data: { required: creditsCost, available: (creditResult && creditResult.credits) || 0 } });
    }
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  function sendEvent(event, data) {
    res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
    if (typeof res.flush === 'function') res.flush();
  }
  const sentences = splitSentences(originalText);
  const total = sentences.length;
  const sentencesMeta = sentences.map((s) => ({
    pIdx: s.pIdx,
    isTitle: !!s.isTitle,
    srcLen: (s.text && s.text.length) || 1,
    text: s.text || ''
  }));
  const renderOrder = buildResultOrder(sentences);
  sendEvent('start', {
    total,
    wordCount,
    creditsCost: LOCAL_REWRITE_TEST_MODE ? 0 : creditsCost,
    sentencesMeta,
    renderOrder,
    rewriteVersion,
    localTestMode: LOCAL_REWRITE_TEST_MODE
  });
  sentences.forEach((sentObj, idx) => {
    if (!shouldRewriteSentence(sentObj)) {
      sendEvent('sentence', { index: idx, total, text: sentObj.text, isTitle: sentObj.isTitle, pIdx: sentObj.pIdx, failed: false });
    }
  });
  try {
    const outcome = await rewriteSentences(sentences, {
      rewriteVersion,
      onDelta: (delta, idx, sentObj) => {
        sendEvent('delta', { index: idx, total, pIdx: sentObj.pIdx, text: delta });
      },
      onResult: (text, idx, sentObj, failed) => {
        sendEvent('sentence', { index: idx, total, text, isTitle: false, pIdx: sentObj.pIdx, failed });
      }
    });
    throwIfAllRewriteTasksFailed(outcome);
    const { results, failedCount } = outcome;
    // 最终降重正文仍由 assembleParagraphs 汇总；逐句逻辑与流式前一致（DeepSeek 返回值经 ensureEndPunct 后写入 sentence，仅多向前端推送 delta 展示）
    const rewrittenText = assembleParagraphs(sentences, results);
    sendEvent('done', {
      creditsCost: LOCAL_REWRITE_TEST_MODE ? 0 : creditsCost,
      failedCount,
      totalSentences: total,
      rewrittenText,
      localTestMode: LOCAL_REWRITE_TEST_MODE
    });
    if (!LOCAL_REWRITE_TEST_MODE) {
      finalizeOrder(userId, null, rewrittenText, wordCount, creditsCost)
        .catch((dbErr) => { logger.error('\u5b58\u6863\u5931\u8d25: ' + dbErr.message); });
    }
  } catch (err) {
    sendEvent('error', { message: err.message || '降重失败' });
  } finally { res.end(); }
});

router.post('/process', [
  body('originalText').notEmpty().withMessage('\u539f\u6587\u4e0d\u80fd\u4e3a\u7a7a'),
  body('rewriteLevel').optional().isInt({ min: 1, max: 3 }),
  body('rewriteVersion').optional().isIn(['v1', 'v2', 'v3'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: '\u53c2\u6570\u9a8c\u8bc1\u5931\u8d25', code: 'VALIDATION_ERROR' });
  const userId = req.user.id;
  const { originalText, rewriteLevel = 2 } = req.body;
  const rewriteVersion = normalizeRewriteVersion(req.body.rewriteVersion);
  const wordCount = originalText.length;
  const creditsCost = Math.ceil(wordCount / 1000 * 18);
  const creditRows = await query('SELECT credits FROM user_credits WHERE user_id = ?', [userId]);
  const creditResult = creditRows[0];
  if (!creditResult || creditResult.credits < creditsCost) {
    return res.status(400).json({ error: '\u79ef\u5206\u4e0d\u8db3', code: 'INSUFFICIENT_CREDITS',
      data: { required: creditsCost, available: (creditResult && creditResult.credits) || 0 } });
  }

  try {
    const rewrittenText = await runRewrite(originalText, rewriteLevel, userId, null, creditsCost, rewriteVersion);
    res.json({
      code: 'SUCCESS',
      data: {
        rewrittenText,
        creditsCost,
        wordCount
      }
    });
  } catch (error) {
    logger.error('\u964d\u91cd\u5904\u7406\u5931\u8d25: ' + error.message);
    res.status(500).json({ error: '\u964d\u91cd\u5931\u8d25', code: 'REWRITE_PROCESS_ERROR' });
  }
});

router.post('/start', [
  body('originalText').notEmpty(),
  body('rewriteLevel').optional().isInt({ min: 1, max: 3 }),
  body('rewriteVersion').optional().isIn(['v1', 'v2', 'v3'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: '参数验证失败', code: 'VALIDATION_ERROR' });
  const userId = req.user.id;
  const { originalText, rewriteLevel = 2 } = req.body;
  const rewriteVersion = normalizeRewriteVersion(req.body.rewriteVersion);
  const wordCount = originalText.length;
  const creditsCost = Math.ceil(wordCount / 1000 * 18);
  const creditRows = await query('SELECT credits FROM user_credits WHERE user_id = ?', [userId]);
  const creditResult = creditRows[0];
  if (!creditResult || creditResult.credits < creditsCost) {
    return res.status(400).json({ error: '积分不足', code: 'INSUFFICIENT_CREDITS',
      data: { required: creditsCost, available: (creditResult && creditResult.credits) || 0 } });
  }
  res.json({ code: 'SUCCESS', data: { orderId: null, creditsCost, message: '降重任务已启动' } });
  try { await runRewrite(originalText, rewriteLevel, userId, null, creditsCost, rewriteVersion); } catch (e) { logger.error('降重任务失败: ' + e.message); }
});

async function runRewrite(originalText, rewriteLevel, userId, orderId, creditsCost, rewriteVersion = 'v1') {
  const wordCount = originalText.length;
  const sentences = splitSentences(originalText);
  const outcome = await rewriteSentences(sentences, { rewriteVersion });
  throwIfAllRewriteTasksFailed(outcome);
  const { results } = outcome;
  const rewrittenText = assembleParagraphs(sentences, results);
  await finalizeOrder(userId, orderId, rewrittenText, wordCount, creditsCost);
  return rewrittenText;
}

router.get('/result/:orderId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;
    const orders = await query('SELECT id, status, result_content FROM orders WHERE id = ? AND user_id = ?', [orderId, userId]);
    if (!orders.length) return res.status(404).json({ error: '订单不存在', code: 'NOT_FOUND' });
    const order = orders[0];
    res.json({ code: 'SUCCESS', data: { orderId: order.id, status: order.status, result: order.result_content } });
  } catch (e) {
    res.status(500).json({ error: '查询失败', code: 'QUERY_ERROR' });
  }
});

// The document workflow consumes the exact same sentence splitter and DeepSeek
// rewrite pipeline.  These references are an internal integration seam only;
// the existing /api/rewrite routes and their behavior remain unchanged.
router.documentRewritePipeline = {
  splitSentences,
  rewriteSentences,
  buildResultOrder,
  assembleParagraphs,
  ensureEndPunct,
  throwIfAllRewriteTasksFailed
};

module.exports = router;

