/**
 * Single source of truth for every rewrite entry point.
 *
 * The HTTP routes remain backward compatible, but text and document rewrite
 * use the same model, reasoning, sampling and token settings.
 */
const { resolveDeepSeekCall, applyDeepSeekReasoning } = require('./ai-model-router');

const DEFAULT_REWRITE_MODEL = 'deepseek-v4-pro';
const DEFAULT_REWRITE_THINKING = 'enabled';
const DEFAULT_REWRITE_REASONING_EFFORT = 'low';

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

function hasConfiguredValue(...values) {
  return values.some((value) => value != null && String(value).trim() !== '');
}

function getRewriteConfig(env = process.env) {
  const resolvedSelection = resolveDeepSeekCall('rewrite', {}, env);
  const selection = Object.freeze({
    ...resolvedSelection,
    model: resolvedSelection.modelSource === 'default'
      ? DEFAULT_REWRITE_MODEL
      : resolvedSelection.model,
    thinking: hasConfiguredValue(env.DEEPSEEK_REWRITE_THINKING, env.DEEPSEEK_THINKING)
      ? resolvedSelection.thinking
      : DEFAULT_REWRITE_THINKING,
    reasoningEffort: hasConfiguredValue(env.DEEPSEEK_REWRITE_REASONING_EFFORT, env.DEEPSEEK_REASONING_EFFORT)
      ? resolvedSelection.reasoningEffort
      : DEFAULT_REWRITE_REASONING_EFFORT
  });
  return Object.freeze({
    model: selection.model,
    selection,
    temperature: Math.max(0, Math.min(2, readNumber(
      env.DEEPSEEK_REWRITE_TEMPERATURE,
      env.DEEPSEEK_TEMPERATURE,
      1
    ))),
    topP: Math.max(0, Math.min(1, readNumber(
      env.DEEPSEEK_REWRITE_TOP_P,
      env.DEEPSEEK_TOP_P,
      1
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
    top_p: config.topP,
    max_tokens: config.maxTokens,
    stream,
    ...(stream ? { stream_options: { include_usage: true } } : {})
  }, config.selection);
}

module.exports = { getRewriteConfig, buildRewritePayload };
