/**
 * Single source of truth for every rewrite entry point.
 *
 * The HTTP routes remain backward compatible, but text and document rewrite
 * use the same model, reasoning, temperature and token settings.
 */
const { resolveDeepSeekCall, applyDeepSeekReasoning } = require('./ai-model-router');

function readNumber(...values) {
  for (const value of values) {
    if (value == null || String(value).trim() === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function readInteger(fallback, ...values) {
  for (const value of values) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function getRewriteConfig(env = process.env) {
  const selection = resolveDeepSeekCall('rewrite', {}, env);
  return Object.freeze({
    model: selection.model,
    selection,
    temperature: Math.max(0, Math.min(2, readNumber(
      env.DEEPSEEK_REWRITE_TEMPERATURE,
      env.DEEPSEEK_TEMPERATURE,
      0.5
    ))),
    maxTokens: readInteger(8192, env.DEEPSEEK_REWRITE_MAX_TOKENS, env.DEEPSEEK_MAX_TOKENS, env.DEEPSEEK_MAX_OUTPUT_TOKENS),
    apiBase: String(env.DEEPSEEK_API_BASE || 'https://api.deepseek.com').replace(/\/+$/, '')
  });
}

function buildRewritePayload({ messages, stream = false, env = process.env } = {}) {
  const config = getRewriteConfig(env);
  return applyDeepSeekReasoning({
    model: config.model,
    messages,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream
  }, config.selection);
}

module.exports = { getRewriteConfig, buildRewritePayload };
