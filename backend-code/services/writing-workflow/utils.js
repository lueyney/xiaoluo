const crypto = require('crypto');

function createTraceId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function countWords(content) {
  return String(content || '').replace(/\s+/g, '').length;
}

function parseTargetWords(requirements, fallback, min, max) {
  const text = String(requirements || '');
  const match = text.match(/(?:约|不少于|不低于|控制在|字数(?:为|约|不少于)?)[^\d]{0,6}(\d{3,5})\s*字?/i)
    || text.match(/(\d{3,5})\s*字/);
  const requested = match ? Number.parseInt(match[1], 10) : fallback;
  return clamp(requested, min, max);
}

function extractJson(text) {
  const source = String(text || '').trim();
  if (!source) throw new Error('模型未返回 JSON');

  const unfenced = source
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(unfenced);
  } catch (_) {
    const firstObject = unfenced.indexOf('{');
    const lastObject = unfenced.lastIndexOf('}');
    if (firstObject >= 0 && lastObject > firstObject) {
      return JSON.parse(unfenced.slice(firstObject, lastObject + 1));
    }
    throw new Error('模型返回的 JSON 无法解析');
  }
}

function safeErrorMessage(error) {
  const message = error && error.message ? error.message : String(error || '未知错误');
  return message.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]').slice(0, 500);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanGeneratedTitle(content) {
  return String(content || '')
    .trim()
    .split(/\r?\n/)[0]
    .replace(/^[\s\d.、一二三四五六七八九十（()）【】\-]+/, '')
    .replace(/^[“”"']+|[“”"'。]+$/g, '')
    .trim()
    .slice(0, 80);
}

function cleanDirectDocumentContent(content) {
  return String(content || '')
    .replace(/^\uFEFF/, '')
    .replace(/^```(?:markdown|md|text)?\s*\r?\n?/i, '')
    .replace(/\r?\n?```\s*$/i, '')
    .trim();
}

module.exports = {
  clamp,
  countWords,
  createTraceId,
  cleanDirectDocumentContent,
  cleanGeneratedTitle,
  extractJson,
  parseTargetWords,
  safeErrorMessage,
  sleep
};
