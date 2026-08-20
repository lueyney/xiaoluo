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
const { getRewriteConfig, buildRewritePayload } = require('../services/rewrite-config');
const { groupRewriteTasks, buildChainedRewriteContext } = require('../services/rewrite-groups');

const router = express.Router();
const LOCAL_REWRITE_TEST_MODE = process.env.NODE_ENV !== 'production'
  && process.env.LOCAL_REWRITE_TEST_MODE === 'true';

router.get('/mode', (req, res) => {
  const rewriteConfig = getRewriteConfig();
  res.json({
    code: 'SUCCESS',
    data: {
      localTestMode: LOCAL_REWRITE_TEST_MODE,
      rewriteConfig: {
        model: rewriteConfig.model,
        temperature: rewriteConfig.temperature,
        thinking: rewriteConfig.selection.thinking,
        reasoningEffort: rewriteConfig.selection.reasoningEffort || 'provider-default'
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

async function rewriteWithDeepSeek(text, onDelta, rewriteVersion = 'v1', options = {}) {
  const releaseSlot = await acquireDeepSeekSlot();
  const timeoutMs = Math.min(
    10 * 60 * 1000,
    Math.max(15 * 1000, Number.parseInt(options.timeoutMs || DEEPSEEK_REQUEST_TIMEOUT_MS, 10) || DEEPSEEK_REQUEST_TIMEOUT_MS)
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const baseURL = (process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com').replace(/\/+$/, '');
    const selection = getRewriteConfig().selection;
    if (!apiKey) throw createDeepSeekError('AI降重服务未配置', { retryable: false, code: 'AI_NOT_CONFIGURED' });
    logDeepSeekSelection(logger, selection, { caller: 'rewriteWithDeepSeek' });

    let response;
    try {
      const requestPayload = buildRewritePayload({
        messages: buildRewriteMessages(text, options.context),
        stream: true
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
        timedOut ? `DeepSeek 请求超过 ${Math.round(timeoutMs / 1000)} 秒` : 'DeepSeek 网络请求失败',
        { code: timedOut ? 'DEEPSEEK_TIMEOUT' : 'DEEPSEEK_NETWORK_ERROR', retryable: true }
      );
    }

    if (!response.ok) {
      const detail = await response.text();
      const retryable = isRetryableStatus(response.status);
      logger.warn('DeepSeek API调用失败: HTTP ' + response.status + ' ' + detail.slice(0, 300));
      throw createDeepSeekError('DeepSeek降重请求失败', {
        code: 'DEEPSEEK_HTTP_ERROR',
        status: response.status,
        retryable,
        retryAfterMs: retryAfterMs(response)
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let result = '';

  function consumeLine(line) {
    const value = line.trim();
    if (!value.startsWith('data:')) return;
    const data = value.slice(5).trim();
    if (!data || data === '[DONE]') return;
    try {
      const payload = JSON.parse(data);
      const delta = payload && payload.choices && payload.choices[0] && payload.choices[0].delta
        ? payload.choices[0].delta.content
        : '';
      if (delta) {
        result += delta;
        if (onDelta) onDelta(delta);
      }
    } catch (error) {
      logger.warn('忽略无法解析的DeepSeek流式片段');
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
    } catch (error) {
      const timedOut = controller.signal.aborted;
      throw createDeepSeekError(
        timedOut ? `DeepSeek 请求超过 ${Math.round(timeoutMs / 1000)} 秒` : 'DeepSeek 流式响应中断',
        { code: timedOut ? 'DEEPSEEK_TIMEOUT' : 'DEEPSEEK_STREAM_ERROR', retryable: true }
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
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const baseURL = (process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com').replace(/\/+$/, '');
    const selection = getRewriteConfig().selection;
    if (!apiKey) throw createDeepSeekError('AI降重服务未配置', { retryable: false, code: 'AI_NOT_CONFIGURED' });
    logDeepSeekSelection(logger, selection, { caller: 'rewriteWithDeepSeekFallback' });
    let response;
    try {
      const requestPayload = buildRewritePayload({
        messages: buildRewriteMessages(text, context),
        stream: false
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
        controller.signal.aborted ? 'DeepSeek fallback 请求超时' : 'DeepSeek fallback 网络请求失败',
        { code: controller.signal.aborted ? 'DEEPSEEK_FALLBACK_TIMEOUT' : 'DEEPSEEK_FALLBACK_NETWORK_ERROR', retryable: false }
      );
    }
    if (!response.ok) {
      const detail = await response.text();
      logger.warn('DeepSeek fallback 调用失败: HTTP ' + response.status + ' ' + detail.slice(0, 300));
      throw createDeepSeekError('DeepSeek fallback 请求失败', {
        code: 'DEEPSEEK_FALLBACK_HTTP_ERROR',
        status: response.status,
        retryable: false
      });
    }
    const rewritten = extractMessageContent(await response.json()).trim();
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
    const parts = para.split(/(?<=[\u3002\uff01\uff1f])/);
    for (const part of parts) { const s = part.trim(); if (s) sentences.push({ text: s, pIdx, isTitle: false }); }
  }
  return sentences;
}

function assembleParagraphs(sentences, results) {
  const paraMap = new Map();
  for (let i = 0; i < sentences.length; i++) {
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
  const cleaned = rewritten.replace(/[\r\n]+/g, '').trim();
  if (!cleaned) return original.trim();
  const PUNCTS = /[\u3002\uff01\uff1f]$/;
  if (PUNCTS.test(original.trim()) && !PUNCTS.test(cleaned)) return cleaned + original.trim().slice(-1);
  return cleaned;
}

// Four effective sentences form one serial chain. Chains run concurrently so
// each sentence can consume the previous rewritten result without turning the
// whole document into one long serial job.
const REWRITE_GROUP_SIZE = Math.min(
  16,
  Math.max(1, Number.parseInt(process.env.REWRITE_GROUP_SIZE || '4', 10) || 4)
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
const DOCUMENT_REWRITE_CONCURRENCY = Math.min(
  256,
  Math.max(1, Number.parseInt(process.env.DOCUMENT_REWRITE_CONCURRENCY || '128', 10) || 128)
);
const DOCUMENT_REWRITE_INITIAL_CONCURRENCY = Math.min(
  DOCUMENT_REWRITE_CONCURRENCY,
  Math.max(1, Number.parseInt(process.env.DOCUMENT_REWRITE_INITIAL_CONCURRENCY || '32', 10) || 32)
);
const DOCUMENT_REWRITE_MIN_CONCURRENCY = Math.min(
  DOCUMENT_REWRITE_INITIAL_CONCURRENCY,
  Math.max(1, Number.parseInt(process.env.DOCUMENT_REWRITE_MIN_CONCURRENCY || '8', 10) || 8)
);

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
  let failedCount = 0;
  let retriedCount = 0;
  let fallbackCount = 0;
  let fallbackRecoveredCount = 0;

  const academicAlternation = normalizeRewriteVersion(rewriteVersion) === 'v1';
  for (let idx = 0; idx < sentences.length; idx++) {
    if (!shouldRewriteSentence(sentences[idx])) continue;
    tasks.push({
      idx,
      sentObj: sentences[idx],
      promptVariant: academicAlternation ? academicPromptVariantForIndex(tasks.length) : null
    });
  }
  logger.info('AI降重任务拆分完成', {
    model: getRewriteConfig().model,
    rewriteVersion,
    requestMode: 'one-sentence-per-request',
    sentenceUnits: sentences.length,
    requestCount: tasks.length,
    skippedCount: sentences.length - tasks.length
  });
  const groups = groupRewriteTasks(tasks, REWRITE_GROUP_SIZE);

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

  async function executeTask(task, reportPressure, previousTask = null) {
    const { idx, sentObj, promptVariant } = task;
    const context = buildChainedRewriteContext(sentences, results, task, previousTask);
    let lastError = null;
    let attempts = 0;
    let pressure = false;

    for (let attempt = 0; attempt <= retryLimit; attempt++) {
      attempts += 1;
      try {
        const rewritten = await rewriteWithDeepSeek(sentObj.text, (delta) => {
          if (delta && onDelta) onDelta(delta, idx, sentObj);
        }, rewriteVersion, { context });
        if (!rewritten) {
          throw createDeepSeekError('DeepSeek 返回内容不可用', {
            code: 'DEEPSEEK_EMPTY_OUTPUT',
            retryable: true
          });
        }
        results[idx] = ensureEndPunct(sentObj.text, rewritten);
        if (attempts > 1) retriedCount += 1;
        return { failed: false, pressure, attempts };
      } catch (error) {
        lastError = error;
        const attemptPressure = error.status === 429 || error.status === 503
          || error.code === 'DEEPSEEK_TIMEOUT' || error.code === 'DEEPSEEK_NETWORK_ERROR'
          || error.code === 'DEEPSEEK_STREAM_ERROR';
        pressure = pressure || attemptPressure;
        if (attemptPressure && reportPressure) reportPressure();
        if (attempt >= retryLimit || error.retryable === false) break;
        await sleep(retryDelay(error, attempt));
      }
    }

    if (adaptiveConcurrency && (!lastError || lastError.retryable !== false)) {
      try {
        attempts += 1;
        const fallbackText = await rewriteWithDeepSeekFallback(sentObj.text, rewriteVersion, context);
        if (!fallbackText) {
          throw createDeepSeekError('DeepSeek fallback 返回内容不可用', {
            code: 'DEEPSEEK_FALLBACK_EMPTY_OUTPUT',
            retryable: false
          });
        }
        results[idx] = ensureEndPunct(sentObj.text, fallbackText);
        retriedCount += 1;
        fallbackRecoveredCount += 1;
        return { failed: false, pressure: false, skipIncrease: pressure, attempts, recoveredByFallback: true };
      } catch (fallbackError) {
        lastError = fallbackError;
      }
    }

    failedCount += 1;
    fallbackCount += 1;
    results[idx] = sentObj.text;
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
    return {
      results,
      failedCount,
      retriedCount,
      fallbackCount,
      fallbackRecoveredCount,
      concurrency: { adaptive: adaptiveConcurrency, min: 0, max: 0, final: 0 }
    };
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
        const group = groups[nextGroup++];
        active += 1;
        (async () => {
          let previousTask = null;
          let groupPressure = false;
          let groupFailed = false;
          let groupSkipIncrease = false;
          for (const task of group) {
            const outcome = await executeTask(task, () => {
              groupPressure = true;
              tune({ pressure: true, failed: false, skipIncrease: true });
            }, previousTask);
            groupPressure = groupPressure || outcome.pressure;
            groupFailed = groupFailed || outcome.failed;
            groupSkipIncrease = groupSkipIncrease || outcome.skipIncrease;
            if (onResult) onResult(results[task.idx], task.idx, task.sentObj, outcome.failed, {
              attempts: outcome.attempts,
              fallback: outcome.failed,
              recoveredByFallback: !!outcome.recoveredByFallback,
              promptVariant: task.promptVariant,
              concurrency: currentLimit
            });
            previousTask = outcome.failed ? null : task;
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

  return {
    results,
    failedCount,
    retriedCount,
    fallbackCount,
    fallbackRecoveredCount,
    concurrency: {
      adaptive: adaptiveConcurrency,
      min: minimumObserved,
      max: maximumObserved,
      final: currentLimit,
      ceiling: workerCeiling
    }
  };
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
  sendEvent('start', {
    total,
    wordCount,
    creditsCost: LOCAL_REWRITE_TEST_MODE ? 0 : creditsCost,
    sentencesMeta,
    rewriteVersion,
    localTestMode: LOCAL_REWRITE_TEST_MODE
  });
  sentences.forEach((sentObj, idx) => {
    if (!shouldRewriteSentence(sentObj)) {
      sendEvent('sentence', { index: idx, total, text: sentObj.text, isTitle: sentObj.isTitle, pIdx: sentObj.pIdx, failed: false });
    }
  });
  try {
    const { results, failedCount } = await rewriteSentences(sentences, {
      rewriteVersion,
      onDelta: (delta, idx, sentObj) => {
        sendEvent('delta', { index: idx, total, pIdx: sentObj.pIdx, text: delta });
      },
      onResult: (text, idx, sentObj, failed) => {
        sendEvent('sentence', { index: idx, total, text, isTitle: false, pIdx: sentObj.pIdx, failed });
      }
    });
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
  const { results } = await rewriteSentences(sentences, { rewriteVersion });
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
router.documentRewritePipeline = { splitSentences, rewriteSentences, assembleParagraphs, ensureEndPunct };

module.exports = router;

