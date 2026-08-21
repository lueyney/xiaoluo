const { Packer } = require('docx');
const { generateWordDocx } = require('../utils/word-generator');

function hasDeepSeekConfig(env = process.env) {
  return Boolean(String(env.DEEPSEEK_API_KEY || '').trim());
}

function isDocumentExportReady() {
  return typeof Packer.toBuffer === 'function' && typeof generateWordDocx === 'function';
}

async function getReadiness({ query, payStatus, env = process.env } = {}) {
  const status = {
    database: false,
    deepseekConfigured: hasDeepSeekConfig(env),
    wechatPay: {
      nativeReady: Boolean(payStatus && payStatus.nativeReady),
      notifyReady: Boolean(payStatus && payStatus.notifyReady),
      privateKeyLoaded: Boolean(payStatus && payStatus.privateKeyLoaded),
      missing: Array.from(new Set([
        ...((payStatus && payStatus.nativeMissing) || []),
        ...((payStatus && payStatus.notifyMissing) || [])
      ]))
    },
    documentExportReady: isDocumentExportReady()
  };

  try {
    await query('SELECT 1 AS ready');
    status.database = true;
  } catch (_) {
    status.database = false;
  }

  status.ready = status.database
    && status.deepseekConfigured
    && status.wechatPay.nativeReady
    && status.wechatPay.notifyReady
    && status.documentExportReady;
  return status;
}

module.exports = {
  getReadiness,
  hasDeepSeekConfig,
  isDocumentExportReady
};
