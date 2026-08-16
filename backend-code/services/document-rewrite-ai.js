/**
 * Document-mode adapter for the project's existing DeepSeek rewrite setup.
 *
 * The route and document workflows share the academic V1 prompt. This adapter
 * remains available for integrations that need one sentence per call so the
 * DOCX service can preserve a strict sentence-to-sentence map.
 */

const logger = require('../utils/logger');
const { buildRewritePrompt, normalizeRewriteVersion } = require('./rewrite-prompts');

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
  const baseURL = (process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com').replace(/\/+$/, '');
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro';
  const rewriteVersion = normalizeRewriteVersion(context.rewriteVersion);
  const response = await fetch(baseURL + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: buildRewritePrompt(text, rewriteVersion, context) }],
      thinking: { type: 'enabled' },
      reasoning_effort: 'low',
      temperature: Number(process.env.DEEPSEEK_TEMPERATURE || 0.7),
      max_tokens: Number(process.env.DEEPSEEK_MAX_TOKENS || 8192),
      stream: false
    })
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
