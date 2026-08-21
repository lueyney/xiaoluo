/**
 * 微信支付 V3 API 工具类
 * 商户号: 1730723347
 */

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// 微信支付配置
const WECHAT_PAY_CONFIG = {
  appId: process.env.WECHAT_APP_ID,
  mchId: process.env.WECHAT_MCH_ID,
  apiV3Key: process.env.WECHAT_APIV3_KEY,
  certSerial: process.env.WECHAT_CERT_SERIAL,
  // 完全通过环境变量配置，不硬编码域名（符合容器化部署规范）
  notifyUrl: process.env.WECHAT_NOTIFY_URL || (() => {
    logger.warn('⚠️  WECHAT_NOTIFY_URL 未配置，支付回调功能将不可用');
    return '';
  })(),
  privateKeyPath: process.env.WECHAT_PRIVATE_KEY_PATH
    ? path.resolve(process.env.WECHAT_PRIVATE_KEY_PATH)
    : path.join(__dirname, '../certs/apiclient_key.pem')
};

function normalizePrivateKey(value) {
  const key = String(value || '').trim().replace(/\\n/g, '\n');
  return key.includes('-----BEGIN PRIVATE KEY-----') ? key : '';
}

// 云部署优先从环境变量加载，兼容平台不支持挂载私钥文件的情况。
// WECHAT_PRIVATE_KEY_BASE64 适合不便保存多行环境变量的平台。
let privateKey = normalizePrivateKey(process.env.WECHAT_PRIVATE_KEY);
let privateKeySource = privateKey ? 'WECHAT_PRIVATE_KEY' : '';
if (!privateKey && process.env.WECHAT_PRIVATE_KEY_BASE64) {
  try {
    privateKey = normalizePrivateKey(Buffer.from(process.env.WECHAT_PRIVATE_KEY_BASE64, 'base64').toString('utf8'));
    if (privateKey) privateKeySource = 'WECHAT_PRIVATE_KEY_BASE64';
  } catch (error) {
    logger.error('❌ WECHAT_PRIVATE_KEY_BASE64 解码失败:', error.message);
  }
}
try {
  if (!privateKey && fs.existsSync(WECHAT_PAY_CONFIG.privateKeyPath)) {
    privateKey = normalizePrivateKey(fs.readFileSync(WECHAT_PAY_CONFIG.privateKeyPath, 'utf8'));
    if (privateKey) privateKeySource = WECHAT_PAY_CONFIG.privateKeyPath;
  }
  if (privateKey) logger.info(`✅ 商户私钥加载成功（${privateKeySource}）`);
  else logger.warn('⚠️ 商户私钥未配置，请设置 WECHAT_PRIVATE_KEY/WECHAT_PRIVATE_KEY_BASE64 或挂载 apiclient_key.pem');
} catch (error) {
  logger.error('❌ 加载商户私钥失败:', error.message);
}

function validatePayConfig(options = {}) {
  const requireApiV3Key = options.requireApiV3Key !== false;
  const missing = [];
  if (!WECHAT_PAY_CONFIG.appId) missing.push('WECHAT_APP_ID');
  if (!WECHAT_PAY_CONFIG.mchId || WECHAT_PAY_CONFIG.mchId === 'your_mchid') missing.push('WECHAT_MCH_ID');
  if (requireApiV3Key && (!WECHAT_PAY_CONFIG.apiV3Key || WECHAT_PAY_CONFIG.apiV3Key.length !== 32)) missing.push('WECHAT_APIV3_KEY');
  if (!WECHAT_PAY_CONFIG.certSerial) missing.push('WECHAT_CERT_SERIAL');
  if (!WECHAT_PAY_CONFIG.notifyUrl) missing.push('WECHAT_NOTIFY_URL');
  if (!privateKey) missing.push('WECHAT_PRIVATE_KEY');
  return { valid: missing.length === 0, missing };
}

function getPayConfigStatus() {
  const nativeState = validatePayConfig({ requireApiV3Key: false });
  const notifyState = validatePayConfig();
  return {
    valid: notifyState.valid,
    missing: notifyState.missing,
    nativeReady: nativeState.valid,
    notifyReady: notifyState.valid,
    nativeMissing: nativeState.missing,
    notifyMissing: notifyState.missing,
    privateKeyLoaded: Boolean(privateKey),
    privateKeySource: privateKeySource || null,
    notifyUrlConfigured: Boolean(WECHAT_PAY_CONFIG.notifyUrl)
  };
}

/**
 * 生成随机字符串
 */
function generateNonceStr(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 生成签名
 */
function generateSignature(method, url, timestamp, nonceStr, body = '') {
  const message = `${method}\n${url}\n${timestamp}\n${nonceStr}\n${body}\n`;

  if (!privateKey) {
    throw new Error('商户私钥未加载');
  }

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(message);
  return sign.sign(privateKey, 'base64');
}

/**
 * 构建Authorization请求头
 */
function buildAuthorizationHeader(method, url, body = '') {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonceStr = generateNonceStr();
  const signature = generateSignature(method, url, timestamp, nonceStr, body);

  return `WECHATPAY2-SHA256-RSA2048 mchid="${WECHAT_PAY_CONFIG.mchId}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${WECHAT_PAY_CONFIG.certSerial}"`;
}

/**
 * JSAPI下单
 * @param {Object} params - 下单参数
 * @returns {Promise<Object>} 预支付交易会话标识
 */
async function createJsapiOrder(params) {
  const { outTradeNo, description, amount, openid } = params;

  if (!outTradeNo || outTradeNo.length < 6 || outTradeNo.length > 32) {
    throw new Error('商户订单号格式错误，长度应为6-32位');
  }

  // 检查必要的配置（容器化部署必须通过环境变量配置）
  if (!WECHAT_PAY_CONFIG.notifyUrl) {
    logger.error('❌ WECHAT_NOTIFY_URL 环境变量未配置，无法创建支付订单');
    return {
      success: false,
      error: '支付回调地址未配置，请联系管理员'
    };
  }

  const url = '/v3/pay/transactions/jsapi';
  const fullUrl = `https://api.mch.weixin.qq.com${url}`;

  const requestBody = {
    appid: WECHAT_PAY_CONFIG.appId,
    mchid: WECHAT_PAY_CONFIG.mchId,
    description: description || '充值积分',
    out_trade_no: outTradeNo,
    notify_url: WECHAT_PAY_CONFIG.notifyUrl,
    amount: {
      total: amount, // 单位：分
      currency: 'CNY'
    },
    payer: {
      openid: openid
    }
  };

  const bodyStr = JSON.stringify(requestBody);

  try {
    logger.info('📤 发起JSAPI下单请求');
    logger.info('   商户订单号:', outTradeNo);
    logger.info('   支付金额:', amount, '分');
    logger.info('   用户OpenID:', openid);

    const authorization = buildAuthorizationHeader('POST', url, bodyStr);

    const response = await axios.post(fullUrl, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authorization
      },
      timeout: 10000
    });

    logger.info('✅ JSAPI下单成功');
    logger.info('   预支付ID:', response.data.prepay_id);

    return {
      success: true,
      prepayId: response.data.prepay_id
    };
  } catch (error) {
    logger.error('❌ JSAPI下单失败:', error.message);
    if (error.response) {
      logger.error('   响应状态:', error.response.status);
      logger.error('   响应数据:', error.response.data);
    }
    return {
      success: false,
      error: error.response?.data || error.message
    };
  }
}

/**
 * 生成小程序调起支付参数
 */
function generateMiniProgramPayParams(prepayId) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = generateNonceStr();
  const packageStr = `prepay_id=${prepayId}`;

  // 生成签名
  const message = `${WECHAT_PAY_CONFIG.appId}\n${timestamp}\n${nonceStr}\n${packageStr}\n`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(message);
  const paySign = sign.sign(privateKey, 'base64');

  return {
    timeStamp: timestamp,
    nonceStr: nonceStr,
    package: packageStr,
    signType: 'RSA',
    paySign: paySign
  };
}

/**
 * 处理支付回调通知（含防重放 + 签名头校验）
 */
function handlePaymentNotify(headers, body) {
  try {
    logger.info('🔐 验证支付回调签名');

    // ── 1. 校验必要签名请求头 ──────────────────────────────────
    const timestamp = headers['wechatpay-timestamp'];
    const nonce     = headers['wechatpay-nonce'];
    const signature = headers['wechatpay-signature'];

    if (!timestamp || !nonce || !signature) {
      logger.error('❌ 回调缺少必要签名头 (wechatpay-timestamp/nonce/signature)');
      return { success: false, error: '缺少签名头' };
    }

    // ── 2. 防重放：时间戳与当前时间差不超过 5 分钟 ────────────
    const timeDiff = Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp, 10));
    if (timeDiff > 300) {
      logger.error(`❌ 回调时间戳超出允许范围，差值: ${timeDiff}秒`);
      return { success: false, error: '请求已过期，拒绝处理' };
    }
    logger.info(`✅ 时间戳防重放验证通过（差值${timeDiff}秒）`);

    // ── 3. 预留平台公钥签名验证（生产环境强烈建议启用） ────────
    // 完整验签需下载微信平台证书（GET /v3/certificates）并缓存平台公钥。
    // 启用后取消下方注释，将 platformPublicKey 替换为实际平台公钥内容：
    //
    // const rawBody = Buffer.isBuffer(body) ? body.toString('utf8') : JSON.stringify(body);
    // const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
    // const verify  = crypto.createVerify('RSA-SHA256');
    // verify.update(message);
    // if (!verify.verify(platformPublicKey, signature, 'base64')) {
    //   logger.error('❌ 平台签名验证失败');
    //   return { success: false, error: '签名验证失败' };
    // }
    // logger.info('✅ 平台签名验证通过');

    // ── 4. 解密回调数据 ───────────────────────────────────────
    const { resource } = body;
    if (!resource || !resource.ciphertext) {
      logger.error('❌ 回调数据格式错误');
      return { success: false, error: '数据格式错误' };
    }

    // 解密数据
    const decrypted = decryptData(
      resource.ciphertext,
      resource.associated_data,
      resource.nonce
    );

    const data = JSON.parse(decrypted);

    logger.info('✅ 回调数据解密成功');
    logger.info('   商户订单号:', data.out_trade_no);
    logger.info('   微信订单号:', data.transaction_id);
    logger.info('   支付状态:', data.trade_state);

    return {
      success: true,
      outTradeNo: data.out_trade_no,
      transactionId: data.transaction_id,
      tradeState: data.trade_state,
      amount: data.amount.total
    };
  } catch (error) {
    logger.error('❌ 处理支付回调失败:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 解密回调数据
 */
function decryptData(ciphertext, associatedData, nonce) {
  // apiV3Key 是32字节UTF-8字符串，需转为Buffer
  const key = Buffer.from(WECHAT_PAY_CONFIG.apiV3Key, 'utf8');

  // ciphertext 是整体Base64编码，解码后末尾16字节为GCM Auth Tag
  const ciphertextBuf = Buffer.from(ciphertext, 'base64');
  const authTag = ciphertextBuf.slice(ciphertextBuf.length - 16);
  const dataBuf  = ciphertextBuf.slice(0, ciphertextBuf.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'utf8'));
  decipher.setAuthTag(authTag);
  if (associatedData) {
    decipher.setAAD(Buffer.from(associatedData, 'utf8'));
  }

  const decrypted = Buffer.concat([decipher.update(dataBuf), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * 生成回调响应
 */
function generateNotifyResponse(success, message = '') {
  return {
    code: success ? 'SUCCESS' : 'FAIL',
    message: message
  };
}

/**
 * 查询订单
 */
async function queryOrder(outTradeNo) {
  const url = `/v3/pay/transactions/out-trade-no/${outTradeNo}?mchid=${WECHAT_PAY_CONFIG.mchId}`;
  const fullUrl = `https://api.mch.weixin.qq.com${url}`;

  try {
    const authorization = buildAuthorizationHeader('GET', url);

    const response = await axios.get(fullUrl, {
      headers: {
        'Accept': 'application/json',
        'Authorization': authorization
      },
      timeout: 10000
    });

    logger.info('✅ 查询微信订单成功:', {
      out_trade_no: response.data.out_trade_no,
      trade_state: response.data.trade_state,
      transaction_id: response.data.transaction_id
    });

    return {
      success: true,
      data: response.data,
      // 兼容字段：微信返回的是 trade_state，这里同时提供 tradeState
      tradeState: response.data.trade_state,
      transactionId: response.data.transaction_id
    };
  } catch (error) {
    logger.error('查询订单失败:', error.message);
    if (error.response) {
      logger.error('   响应状态:', error.response.status);
      logger.error('   响应数据:', error.response.data);
    }
    return {
      success: false,
      error: error.response?.data || error.message
    };
  }
}

/**
 * 关闭订单
 */
async function closeOrder(outTradeNo) {
  const url = `/v3/pay/transactions/out-trade-no/${outTradeNo}/close`;
  const fullUrl = `https://api.mch.weixin.qq.com${url}`;

  const requestBody = {
    mchid: WECHAT_PAY_CONFIG.mchId
  };

  const bodyStr = JSON.stringify(requestBody);

  try {
    const authorization = buildAuthorizationHeader('POST', url, bodyStr);

    await axios.post(fullUrl, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authorization
      },
      timeout: 10000
    });

    logger.info('✅ 订单关闭成功:', outTradeNo);
    return { success: true };
  } catch (error) {
    logger.error('❌ 关闭订单失败:', error.message);
    return {
      success: false,
      error: error.response?.data || error.message
    };
  }
}

/**
 * Native支付下单（网页扫码支付）
 * @param {Object} params - { outTradeNo, description, amount }
 * @returns {Promise<Object>} { success, codeUrl } or { mock: true }
 */
async function createNativeOrder(params) {
  const { outTradeNo, description, amount } = params;

  // APIv3 密钥用于支付通知解密，不参与 Native 下单签名；二维码创建
  // 不应因该字段暂时缺失而被提前阻断，支付回调仍会由完整状态检查告警。
  const configState = validatePayConfig({ requireApiV3Key: false });
  if (!configState.valid) {
    if (process.env.NODE_ENV !== 'production' && configState.missing.includes('WECHAT_MCH_ID')) {
      logger.warn('⚠️  微信支付未完整配置，返回mock模式');
      return { mock: true };
    }
    logger.error('❌ 微信支付配置不完整:', configState.missing.join(', '));
    return {
      success: false,
      code: 'PAY_CONFIG_ERROR',
      error: `微信支付配置不完整：${configState.missing.join(', ')}`
    };
  }

  if (!outTradeNo || outTradeNo.length < 6 || outTradeNo.length > 32) {
    return { success: false, error: '商户订单号格式错误' };
  }

  const url = '/v3/pay/transactions/native';
  const fullUrl = `https://api.mch.weixin.qq.com${url}`;

  const requestBody = {
    appid: WECHAT_PAY_CONFIG.appId,
    mchid: WECHAT_PAY_CONFIG.mchId,
    description: description || '充值积分',
    out_trade_no: outTradeNo,
    notify_url: WECHAT_PAY_CONFIG.notifyUrl,
    amount: { total: amount, currency: 'CNY' }
  };

  const bodyStr = JSON.stringify(requestBody);

  try {
    logger.info('📤 发起Native下单请求', { outTradeNo, amountFen: amount });

    const authorization = buildAuthorizationHeader('POST', url, bodyStr);
    const response = await axios.post(fullUrl, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authorization
      },
      timeout: 10000
    });

    logger.info('✅ Native下单成功, code_url:', response.data.code_url);
    return { success: true, codeUrl: response.data.code_url };
  } catch (error) {
    logger.error('❌ Native下单失败', {
      message: error.message || String(error),
      code: error.code || null,
      responseStatus: error.response && error.response.status || null,
      responseData: error.response && error.response.data || null,
      outTradeNo
    });
    if (error.response) {
      const errData = error.response.data;
      // 商户未开通Native支付产品权限
      if (errData && errData.code === 'NO_AUTH') {
        logger.error('❌ 商户号未开通Native扫码支付权限，请登录微信商户平台 > 产品中心 开通');
        return { success: false, error: '商户未开通扫码支付权限，请联系管理员', code: 'NO_AUTH' };
      }
    }
    const responseError = error.response && error.response.data;
    return {
      success: false,
      code: responseError && responseError.code || 'WECHAT_REQUEST_FAILED',
      error: responseError || error.message
    };
  }
}

module.exports = {
  createJsapiOrder,
  createNativeOrder,
  generateMiniProgramPayParams,
  handlePaymentNotify,
  generateNotifyResponse,
  queryOrder,
  closeOrder,
  generateNonceStr,
  validatePayConfig,
  getPayConfigStatus
};
