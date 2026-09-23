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
const DEFAULT_GLM_API_BASE = 'https://open.bigmodel.cn/api/paas/v4';
const DEFAULT_GLM_REWRITE_MODELS = Object.freeze(['glm-4.7', 'glm-5.3']);

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

function readBoolean(value, fallback = false) {
  if (value == null || String(value).trim() === '') return fallback;
  return !['0', 'false', 'off', 'disabled', 'no'].includes(String(value).trim().toLowerCase());
}

function readModelList(value, fallback = DEFAULT_GLM_REWRITE_MODELS) {
  const models = String(value || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  const supported = models.filter((model) => DEFAULT_GLM_REWRITE_MODELS.includes(model));
  return supported.length ? [...new Set(supported)] : [...fallback];
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
    provider: 'deepseek',
    routeId: 'deepseek',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
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

function getGlmRewriteConfigs(env = process.env) {
  const models = readModelList(env.GLM_REWRITE_MODELS || env.GLM_REWRITE_MODEL);
  return models.map((model) => {
    const isGlm53 = model === 'glm-5.3';
    const selection = Object.freeze({
      task: 'rewrite',
      provider: 'glm',
      model,
      modelSource: hasConfiguredValue(env.GLM_REWRITE_MODELS, env.GLM_REWRITE_MODEL) ? 'task-env' : 'default',
      // GLM-5.3 requires Thinking and exposes low/high/max. GLM-4.7's
      // compatible API call keeps thinking enabled but does not accept the
      // reasoning_effort field; omit it for that model.
      thinking: 'enabled',
      reasoningEffort: isGlm53 ? 'low' : '',
      modelProvidesReasoning: isGlm53
    });
    return Object.freeze({
      provider: 'glm',
      routeId: `glm:${model}`,
      apiKeyEnv: 'GLM_API_KEY',
      model,
      selection,
      temperature: Math.max(0, Math.min(2, readNumber(
        env.GLM_REWRITE_TEMPERATURE,
        env.GLM_TEMPERATURE,
        1
      ))),
      topP: Math.max(0, Math.min(1, readNumber(
        env.GLM_REWRITE_TOP_P,
        env.GLM_TOP_P,
        1
      ))),
      maxTokens: readInteger(8192, env.GLM_REWRITE_MAX_TOKENS, env.GLM_MAX_TOKENS),
      apiBase: String(env.GLM_API_BASE || DEFAULT_GLM_API_BASE).replace(/\/+$/, '')
    });
  });
}

function getRewriteProviderCycle(env = process.env) {
  const deepSeek = getRewriteConfig(env);
  const glm = getGlmRewriteConfigs(env);
  // DeepSeek is the safe/default route. GLM rotation is opt-in so a missing
  // or partially configured GLM deployment cannot unexpectedly change model
  // selection or exhaust GLM rate limits.
  const rotationEnabled = readBoolean(env.REWRITE_PROVIDER_ROTATION, false)
    && hasConfiguredValue(env.GLM_API_KEY);
  if (!rotationEnabled) return Object.freeze([deepSeek]);
  if (!hasConfiguredValue(env.DEEPSEEK_API_KEY)) return Object.freeze(glm);
  const cycle = [];
  // A sentence-level cycle alternates providers while also distributing GLM
  // 4.7 and GLM 5.3 evenly: DeepSeek → GLM-4.7 → DeepSeek → GLM-5.3.
  for (const glmConfig of glm) cycle.push(deepSeek, glmConfig);
  return Object.freeze(cycle);
}

function getRewriteProviderConfig(routeId, env = process.env) {
  const requested = String(routeId || '').trim().toLowerCase();
  if (!requested || requested === 'deepseek') return getRewriteConfig(env);
  return getGlmRewriteConfigs(env).find((config) => config.routeId === requested) || getRewriteConfig(env);
}

function rewriteProviderSummary(config) {
  return Object.freeze({
    provider: config.provider,
    routeId: config.routeId,
    model: config.model,
    thinking: config.selection.thinking,
    reasoningEffort: config.selection.reasoningEffort || 'provider-default'
  });
}

function buildRewritePayload({ messages, stream = false, env = process.env, providerConfig = null } = {}) {
  const config = providerConfig || getRewriteConfig(env);
  return applyDeepSeekReasoning({
    model: config.model,
    messages,
    temperature: config.temperature,
    top_p: config.topP,
    max_tokens: config.maxTokens,
    stream,
    // DeepSeek supports usage in its final SSE chunk through stream_options.
    // The GLM OpenAI-compatible examples do not require this extension.
    ...(stream && config.provider === 'deepseek' ? { stream_options: { include_usage: true } } : {})
  }, config.selection);
}

module.exports = {
  DEFAULT_GLM_API_BASE,
  DEFAULT_GLM_REWRITE_MODELS,
  getRewriteConfig,
  getGlmRewriteConfigs,
  getRewriteProviderCycle,
  getRewriteProviderConfig,
  rewriteProviderSummary,
  buildRewritePayload
};
