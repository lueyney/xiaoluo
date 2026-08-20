/**
 * Document-mode adapter for the project's existing DeepSeek rewrite setup.
 *
 * The route and document workflows share the academic V1 prompt. This adapter
 * remains available for integrations that need one sentence per call so the
 * DOCX service can preserve a strict sentence-to-sentence map.
 */

const logger = require('../utils/logger');
const { buildRewriteMessages, buildRewritePrompt, normalizeRewriteVersion } = require('./rewrite-prompts');
const { logDeepSeekSelection } = require('./ai-model-router');
const { buildRewritePayload, getRewriteConfig } = require('./rewrite-config');

function extractMessageContent(payload) {
  const content = payload && payload.choices && payload.choices[0] && payload.choices[0].message
    ? payload.choices[0].message.content
    : '';
  if (Array.isArray(content)) return content.map((part) => part && (part.text || part.content || '')).join('');
  return typeof content === 'string' ? content : '';
}

async function rewriteDocumentSentence(text, context = {}) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('AI降重服务未配置');
  const config = getRewriteConfig();
  const baseURL = config.apiBase;
  const selection = config.selection;
  const rewriteVersion = normalizeRewriteVersion(context.rewriteVersion);
  logDeepSeekSelection(logger, selection, { caller: 'rewriteDocumentSentence', traceId: context.traceId });
  const requestPayload = buildRewritePayload({
    messages: buildRewriteMessages(text, context),
    stream: false
  });
  const response = await fetch(baseURL + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey
    },
    body: JSON.stringify(requestPayload)
  });
  if (!response.ok) {
    const detail = await response.text();
    logger.error('文档降重 DeepSeek 调用失败: HTTP ' + response.status + ' ' + detail.slice(0, 300));
    throw new Error('DeepSeek降重请求失败');
  }
  const payload = await response.json();
  const rewritten = extractMessageContent(payload).trim();
  if (!rewritten) throw new Error('AI降重返回空结果');
  // Return the model text as-is; document mode only maps this result back to
  // the same sentence ID and does not add punctuation or other content.
  return rewritten;
}

module.exports = { normalizeRewriteVersion, buildPrompt: buildRewritePrompt, rewriteDocumentSentence };
