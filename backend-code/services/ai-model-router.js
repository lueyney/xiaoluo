const TASK_CONFIG = Object.freeze({
  rewrite: {
    modelEnv: 'DEEPSEEK_REWRITE_MODEL',
    reasoningEnv: 'DEEPSEEK_REWRITE_REASONING_EFFORT',
    thinkingEnv: 'DEEPSEEK_REWRITE_THINKING'
  },
  rewriteFallback: {
    modelEnv: 'DEEPSEEK_REWRITE_FALLBACK_MODEL',
    legacyModelEnv: 'DEEPSEEK_FALLBACK_MODEL',
    reasoningEnv: 'DEEPSEEK_REWRITE_FALLBACK_REASONING_EFFORT',
    thinkingEnv: 'DEEPSEEK_REWRITE_FALLBACK_THINKING'
  },
  documentRewrite: {
    modelEnv: 'DEEPSEEK_DOCUMENT_REWRITE_MODEL',
    reasoningEnv: 'DEEPSEEK_DOCUMENT_REWRITE_REASONING_EFFORT',
    thinkingEnv: 'DEEPSEEK_DOCUMENT_REWRITE_THINKING'
  },
  planning: {
    modelEnv: 'DEEPSEEK_PLANNING_MODEL',
    reasoningEnv: 'DEEPSEEK_PLANNING_REASONING_EFFORT',
    thinkingEnv: 'DEEPSEEK_PLANNING_THINKING'
  },
  drafting: {
    modelEnv: 'DEEPSEEK_DRAFTING_MODEL',
    reasoningEnv: 'DEEPSEEK_DRAFTING_REASONING_EFFORT',
    thinkingEnv: 'DEEPSEEK_DRAFTING_THINKING'
  },
  title: {
    modelEnv: 'DEEPSEEK_TITLE_MODEL',
    reasoningEnv: 'DEEPSEEK_TITLE_REASONING_EFFORT',
    thinkingEnv: 'DEEPSEEK_TITLE_THINKING'
  },
  social: {
    modelEnv: 'DEEPSEEK_SOCIAL_MODEL',
    reasoningEnv: 'DEEPSEEK_SOCIAL_REASONING_EFFORT',
    thinkingEnv: 'DEEPSEEK_SOCIAL_THINKING'
  },
  workflow: {
    modelEnv: 'DEEPSEEK_WORKFLOW_MODEL',
    reasoningEnv: 'DEEPSEEK_WORKFLOW_REASONING_EFFORT',
    thinkingEnv: 'DEEPSEEK_WORKFLOW_THINKING'
  }
});

function firstValue(...values) {
  for (const value of values) {
    const normalized = String(value == null ? '' : value).trim();
    if (normalized) return normalized;
  }
  return '';
}

function normalizeReasoningEffort(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['low', 'medium', 'high'].includes(normalized) ? normalized : '';
}

function normalizeThinking(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['1', 'true', 'on', 'enabled'].includes(normalized)) return 'enabled';
  if (['0', 'false', 'off', 'disabled'].includes(normalized)) return 'disabled';
  return 'auto';
}

function resolveDeepSeekCall(task, overrides = {}, env = process.env) {
  const config = TASK_CONFIG[task] || TASK_CONFIG.workflow;
  const modelSource = firstValue(overrides.model)
    ? 'function'
    : firstValue(env[config.modelEnv], config.legacyModelEnv && env[config.legacyModelEnv])
      ? 'task-env'
      : firstValue(env.DEEPSEEK_MODEL)
        ? 'global-env'
        : 'default';
  const model = firstValue(
    overrides.model,
    env[config.modelEnv],
    config.legacyModelEnv && env[config.legacyModelEnv],
    env.DEEPSEEK_MODEL,
    'deepseek-chat'
  );
  const reasoningEffort = normalizeReasoningEffort(firstValue(
    overrides.reasoningEffort,
    env[config.reasoningEnv],
    env.DEEPSEEK_REASONING_EFFORT
  ));
  const thinking = normalizeThinking(firstValue(
    overrides.thinking,
    env[config.thinkingEnv],
    env.DEEPSEEK_THINKING
  ));
  const modelProvidesReasoning = /reasoner|reasoning/i.test(model);

  return {
    task: TASK_CONFIG[task] ? task : 'workflow',
    model,
    modelSource,
    reasoningEffort,
    thinking,
    modelProvidesReasoning
  };
}

function applyDeepSeekReasoning(payload, selection) {
  const result = { ...payload };
  // These optional fields are useful for OpenAI-compatible gateways. They are
  // omitted by default so the official DeepSeek endpoint only receives fields
  // it supports. deepseek-reasoner enables reasoning through the model itself.
  if (selection.thinking !== 'auto') result.thinking = { type: selection.thinking };
  if (selection.reasoningEffort) result.reasoning_effort = selection.reasoningEffort;
  return result;
}

function logDeepSeekSelection(logger, selection, meta = {}) {
  if (!logger || typeof logger.info !== 'function') return;
  logger.info('[AI模型路由]', {
    caller: meta.caller || 'unknown',
    traceId: meta.traceId || undefined,
    task: selection.task,
    model: selection.model,
    modelSource: selection.modelSource,
    reasoning: selection.modelProvidesReasoning ? 'model' : selection.thinking,
    reasoningEffort: selection.reasoningEffort || 'provider-default'
  });
}

function listDeepSeekRoutes(env = process.env) {
  return Object.keys(TASK_CONFIG).map((task) => resolveDeepSeekCall(task, {}, env));
}

module.exports = {
  TASK_CONFIG,
  normalizeReasoningEffort,
  normalizeThinking,
  resolveDeepSeekCall,
  applyDeepSeekReasoning,
  logDeepSeekSelection,
  listDeepSeekRoutes
};
