const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PRIVATE_KEY_SETTING = 'WECHAT_PRIVATE_KEY / WECHAT_PRIVATE_KEY_BASE64 / WECHAT_PRIVATE_KEY_PATH';
const PLACEHOLDER_RE = /^(?:your[_-]|replace[_-]|change[_-]|example|test$|xxx|待填写|请填写|你的)/i;

function normalizeValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isConfiguredValue(value) {
  const normalized = normalizeValue(value);
  return Boolean(normalized) && !PLACEHOLDER_RE.test(normalized);
}

function normalizePem(value) {
  return normalizeValue(value).replace(/\\n/g, '\n');
}

function decodeBase64(value) {
  const normalized = normalizeValue(value).replace(/\s+/g, '');
  if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error('Base64格式无效');
  }
  return Buffer.from(normalized, 'base64').toString('utf8').trim();
}

function loadPrivateKey(env, options = {}) {
  const fsModule = options.fsModule || fs;
  const baseDir = options.baseDir || path.resolve(__dirname, '..');

  if (isConfiguredValue(env.WECHAT_PRIVATE_KEY)) {
    return { value: normalizePem(env.WECHAT_PRIVATE_KEY), source: 'WECHAT_PRIVATE_KEY' };
  }

  if (isConfiguredValue(env.WECHAT_PRIVATE_KEY_BASE64)) {
    try {
      return { value: decodeBase64(env.WECHAT_PRIVATE_KEY_BASE64), source: 'WECHAT_PRIVATE_KEY_BASE64' };
    } catch (error) {
      return { value: '', source: 'WECHAT_PRIVATE_KEY_BASE64', error: error.message };
    }
  }

  const configuredPath = normalizeValue(env.WECHAT_PRIVATE_KEY_PATH);
  const privateKeyPath = configuredPath
    ? (path.isAbsolute(configuredPath) ? configuredPath : path.resolve(baseDir, configuredPath))
    : path.resolve(baseDir, 'certs', 'apiclient_key.pem');

  try {
    if (!fsModule.existsSync(privateKeyPath)) {
      return {
        value: '',
        source: configuredPath ? 'WECHAT_PRIVATE_KEY_PATH' : 'default-file',
        error: configuredPath ? '私钥文件不存在' : ''
      };
    }
    return {
      value: fsModule.readFileSync(privateKeyPath, 'utf8').trim(),
      source: configuredPath ? 'WECHAT_PRIVATE_KEY_PATH' : 'default-file'
    };
  } catch (error) {
    return {
      value: '',
      source: configuredPath ? 'WECHAT_PRIVATE_KEY_PATH' : 'default-file',
      error: error.message
    };
  }
}

function validatePrivateKey(privateKey) {
  if (!privateKey) return '未提供商户API私钥';
  try {
    const keyObject = crypto.createPrivateKey(privateKey);
    if (keyObject.asymmetricKeyType !== 'rsa') return '商户API私钥必须是RSA私钥';
    return '';
  } catch (error) {
    return '商户API私钥不是有效的PEM私钥';
  }
}

function buildPaymentConfig(env = process.env, options = {}) {
  const config = {
    appId: normalizeValue(env.WECHAT_APP_ID),
    mchId: normalizeValue(env.WECHAT_MCH_ID),
    apiV3Key: normalizeValue(env.WECHAT_APIV3_KEY),
    certSerial: normalizeValue(env.WECHAT_CERT_SERIAL).replace(/^0x/i, ''),
    notifyUrl: normalizeValue(env.WECHAT_NOTIFY_URL)
  };
  const privateKeyResult = loadPrivateKey(env, options);
  config.privateKey = privateKeyResult.value;

  const missing = [];
  const invalid = [];
  const requiredFields = [
    ['WECHAT_APP_ID', config.appId],
    ['WECHAT_MCH_ID', config.mchId],
    ['WECHAT_APIV3_KEY', config.apiV3Key],
    ['WECHAT_CERT_SERIAL', config.certSerial],
    ['WECHAT_NOTIFY_URL', config.notifyUrl]
  ];

  requiredFields.forEach(([name, value]) => {
    if (!isConfiguredValue(value)) missing.push(name);
  });

  if (!config.privateKey) {
    missing.push(PRIVATE_KEY_SETTING);
  } else {
    const privateKeyError = validatePrivateKey(config.privateKey);
    if (privateKeyError) invalid.push({ key: PRIVATE_KEY_SETTING, reason: privateKeyError });
  }

  if (isConfiguredValue(config.appId) && !/^wx[A-Za-z0-9]{16}$/.test(config.appId)) {
    invalid.push({ key: 'WECHAT_APP_ID', reason: '应为wx开头的18位AppID' });
  }
  if (isConfiguredValue(config.mchId) && !/^\d{8,15}$/.test(config.mchId)) {
    invalid.push({ key: 'WECHAT_MCH_ID', reason: '商户号格式无效' });
  }
  if (isConfiguredValue(config.apiV3Key) && Buffer.byteLength(config.apiV3Key, 'utf8') !== 32) {
    invalid.push({ key: 'WECHAT_APIV3_KEY', reason: 'APIv3密钥必须正好为32字节' });
  }
  if (isConfiguredValue(config.certSerial) && !/^[A-Fa-f0-9]{16,64}$/.test(config.certSerial)) {
    invalid.push({ key: 'WECHAT_CERT_SERIAL', reason: '证书序列号应为16-64位十六进制字符' });
  }
  if (isConfiguredValue(config.notifyUrl)) {
    try {
      const notifyUrl = new URL(config.notifyUrl);
      if (notifyUrl.protocol !== 'https:' || notifyUrl.username || notifyUrl.password || notifyUrl.hash) {
        invalid.push({ key: 'WECHAT_NOTIFY_URL', reason: '必须是无账号信息和锚点的公网HTTPS地址' });
      }
    } catch (error) {
      invalid.push({ key: 'WECHAT_NOTIFY_URL', reason: 'URL格式无效' });
    }
  }

  const uniqueMissing = [...new Set(missing)];
  const actualPrivateKey = config.privateKey;
  Object.defineProperty(config, 'privateKey', {
    value: actualPrivateKey,
    enumerable: false,
    writable: false,
    configurable: false
  });
  return {
    ready: uniqueMissing.length === 0 && invalid.length === 0,
    config,
    diagnostics: {
      missing: uniqueMissing,
      invalid,
      privateKeySource: privateKeyResult.source,
      privateKeyLoadError: privateKeyResult.error || ''
    }
  };
}

function publicConfigStatus(state) {
  return {
    ready: state.ready,
    missing: [...state.diagnostics.missing],
    invalid: state.diagnostics.invalid.map((item) => ({ ...item })),
    privateKeySource: state.diagnostics.privateKeySource,
    privateKeyLoadError: state.diagnostics.privateKeyLoadError
  };
}

module.exports = {
  PRIVATE_KEY_SETTING,
  buildPaymentConfig,
  publicConfigStatus
};
