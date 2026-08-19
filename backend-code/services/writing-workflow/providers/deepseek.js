const axios = require('axios');
const { extractJson, safeErrorMessage, sleep } = require('../utils');
const {
  applyDeepSeekReasoning,
  logDeepSeekSelection,
  resolveDeepSeekCall
} = require('../../ai-model-router');

class ConcurrencyGate {
  constructor(limit) {
    this.limit = Math.max(1, Number.parseInt(limit, 10) || 1);
    this.active = 0;
    this.waiters = [];
  }

  async acquire() {
    if (this.active < this.limit) {
      this.active += 1;
      return () => this.release();
    }
    await new Promise((resolve) => this.waiters.push(resolve));
    this.active += 1;
    return () => this.release();
  }

  release() {
    this.active = Math.max(0, this.active - 1);
    const next = this.waiters.shift();
    if (next) next();
  }
}

const gates = new Map();

function getGate(config) {
  const key = `${config.apiBase || ''}|${config.apiKey || ''}`;
  const limit = Math.max(1, Number.parseInt(config.maxConcurrentRequests, 10) || 8);
  let gate = gates.get(key);
  if (!gate || gate.limit !== limit) {
    gate = new ConcurrencyGate(limit);
    gates.set(key, gate);
  }
  return gate;
}

class DeepSeekProvider {
  constructor(config, { logger } = {}) {
    this.config = config;
    this.logger = logger;
    this.client = axios.create({
      baseURL: config.apiBase,
      timeout: config.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      }
    });
    this.gate = getGate(config);
  }

  assertConfigured() {
    if (!this.config.apiKey) {
      throw new Error('DEEPSEEK_API_KEY 未配置');
    }
  }

  isRetryable(error) {
    const status = error && error.response && error.response.status;
    return !status || status === 408 || status === 409 || status === 429 || status >= 500;
  }

  async chat({ messages, model, temperature, maxTokens, json = false, traceId, step, task = 'workflow', reasoningEffort, thinking }) {
    this.assertConfigured();
    const startedAt = Date.now();
    let lastError;
    const selection = resolveDeepSeekCall(task, { model, reasoningEffort, thinking });
    logDeepSeekSelection(this.logger, selection, { caller: `DeepSeekProvider.${step || 'chat'}`, traceId });

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        let payload = {
          model: selection.model,
          messages,
          temperature: temperature ?? this.config.temperature,
          max_tokens: maxTokens || this.config.maxOutputTokens,
          stream: false
        };

        if (json) payload.response_format = { type: 'json_object' };
        payload = applyDeepSeekReasoning(payload, selection);

        const release = await this.gate.acquire();
        try {
          const response = await this.client.post('/chat/completions', payload);
        const choice = response.data && response.data.choices && response.data.choices[0];
        const content = choice && choice.message && choice.message.content;
        if (!content) throw new Error('DeepSeek 未返回正文');

        const result = {
          content,
          data: json ? extractJson(content) : null,
          model: response.data.model || selection.model,
          usage: response.data.usage || null,
          durationMs: Date.now() - startedAt
        };

        if (this.logger) {
          this.logger.info(`[writing:${traceId}] DeepSeek ${step} 完成 model=${result.model} duration=${result.durationMs}ms`);
        }
          return result;
        } finally {
          release();
        }
      } catch (error) {
        lastError = error;
        if (attempt >= this.config.maxRetries || !this.isRetryable(error)) break;
        const retryAfter = error.response && Number(error.response.headers['retry-after']);
        const delayMs = Number.isFinite(retryAfter)
          ? retryAfter * 1000
          : Math.min(8000, 750 * (2 ** attempt)) + Math.floor(Math.random() * 250);
        if (this.logger) {
          this.logger.warn(`[writing:${traceId}] DeepSeek ${step} 重试 ${attempt + 1}/${this.config.maxRetries}: ${safeErrorMessage(error)}`);
        }
        await sleep(delayMs);
      }
    }

    const status = lastError && lastError.response && lastError.response.status;
    const suffix = status ? ` (HTTP ${status})` : '';
    throw new Error(`DeepSeek ${step} 失败${suffix}: ${safeErrorMessage(lastError)}`);
  }

  async plan({ messages, traceId, model, temperature, maxTokens }) {
    return this.chat({
      messages,
      model: model || this.config.planningModel,
      task: 'planning',
      temperature: temperature ?? 0.25,
      maxTokens: maxTokens || 4096,
      json: true,
      traceId,
      step: 'planning'
    });
  }

  async draftSection({ messages, traceId, sectionIndex, model, temperature, maxTokens }) {
    return this.chat({
      messages,
      model: model || this.config.draftingModel,
      task: 'drafting',
      temperature: temperature ?? this.config.temperature,
      maxTokens: maxTokens || this.config.maxOutputTokens,
      traceId,
      step: `drafting:${sectionIndex + 1}`
    });
  }

  async generateTitle({ messages, traceId }) {
    return this.chat({
      messages,
      model: this.config.titleModel,
      task: 'title',
      temperature: 0.8,
      maxTokens: 512,
      traceId,
      step: 'title'
    });
  }
}

module.exports = DeepSeekProvider;
