/**
 * 微信支付 V3 API 工具类
 */

const axios = require('axios');
const crypto = require('crypto');
const logger = require('./logger');
const { buildPaymentConfig, publicConfigStatus } = require('./wechat-pay-config');

// 配置只在进程启动时加载。修改云平台环境变量后必须重启/重新部署服务。
const paymentConfigState = buildPaymentConfig(process.env);
const WECHAT_PAY_CONFIG = paymentConfigState.config;
const privateKey = WECHAT_PAY_CONFIG.privateKey;
const loggedConfigOperations = new Set();

function getConfigStatus() {
  return publicConfigStatus(paymentConfigState);
}

// 兼容 /health/readiness：Native 下单本身不使用 APIv3 密钥，
// 但支付回调解密必须使用，因此分别报告两种就绪状态。
function getPayConfigStatus() {
  const status = getConfigStatus();
  const nativeMissing = status.missing.filter((key) => key !== 'WECHAT_APIV3_KEY');
  const nativeInvalid = status.invalid.filter((item) => item.key !== 'WECHAT_APIV3_KEY');
  const notifyMissing = [
    ...status.missing,
    ...status.invalid.map((item) => item.key)
  ];

  return {
    valid: status.ready,
    missing: [...new Set(notifyMissing)],
    nativeReady: nativeMissing.length === 0 && nativeInvalid.length === 0,
    notifyReady: status.ready,
    nativeMissing: [...new Set([
      ...nativeMissing,
      ...nativeInvalid.map((item) => item.key)
    ])],
    notifyMissing: [...new Set(notifyMissing)],
    privateKeyLoaded: Boolean(privateKey),
    privateKeySource: status.privateKeySource || null,
    notifyUrlConfigured: Boolean(WECHAT_PAY_CONFIG.notifyUrl)
  };
}

function ensurePaymentConfigured(operation = '微信支付') {
  if (paymentConfigState.ready) return { ready: true };

  const status = getConfigStatus();
  if (!loggedConfigOperations.has(operation)) {
    loggedConfigOperations.add(operation);
    logger.error('❌ 微信支付配置不完整', {
      operation,
      missing: status.missing,
      invalid: status.invalid,
      privateKeySource: status.privateKeySource,
      privateKeyLoadError: status.privateKeyLoadError || undefined
    });
  }
  return {
    ready: false,
    code: 'WECHAT_PAY_NOT_CONFIGURED',
    error: '微信支付服务配置异常，请联系管理员'
  };
}

if (paymentConfigState.ready) {
  logger.info('✅ 微信支付V3配置校验通过', { privateKeySource: paymentConfigState.diagnostics.privateKeySource });
} else {
  ensurePaymentConfigured('startup');
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

  const configCheck = ensurePaymentConfigured('create-jsapi-order');
  if (!configCheck.ready) return { success: false, ...configCheck };

  if (!outTradeNo || outTradeNo.length < 6 || outTradeNo.length > 32) {
    return { success: false, code: 'INVALID_OUT_TRADE_NO', error: '商户订单号格式错误，长度应为6-32位' };
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
    logger.info('   用户OpenID后4位:', String(openid || '').slice(-4));

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
  const configCheck = ensurePaymentConfigured('generate-mini-program-pay-params');
  if (!configCheck.ready) {
    const error = new Error(configCheck.error);
    error.code = configCheck.code;
    throw error;
  }

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
    const configCheck = ensurePaymentConfigured('handle-payment-notify');
    if (!configCheck.ready) return { success: false, ...configCheck };

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
  const configCheck = ensurePaymentConfigured('query-order');
  if (!configCheck.ready) return { success: false, ...configCheck };

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
  const configCheck = ensurePaymentConfigured('close-order');
  if (!configCheck.ready) return { success: false, ...configCheck };

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

  const configCheck = ensurePaymentConfigured('create-native-order');
  if (!configCheck.ready) return { success: false, ...configCheck };

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
    logger.info('📤 发起Native下单请求');
    logger.info('   商户订单号:', outTradeNo);
    logger.info('   支付金额:', amount, '分');

    const authorization = buildAuthorizationHeader('POST', url, bodyStr);
    const response = await axios.post(fullUrl, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authorization
      },
      timeout: 10000
    });

    logger.info('✅ Native下单成功');
    return { success: true, codeUrl: response.data.code_url };
  } catch (error) {
    logger.error('❌ Native下单失败:', error.message);
    if (error.response) {
      logger.error('   响应状态:', error.response.status);
      logger.error('   响应数据:', error.response.data);
      const errData = error.response.data;
      // 商户未开通Native支付产品权限
      if (errData && errData.code === 'NO_AUTH') {
        logger.error('❌ 商户号未开通Native扫码支付权限，请登录微信商户平台 > 产品中心 开通');
        return { success: false, error: '商户未开通扫码支付权限，请联系管理员', code: 'NO_AUTH' };
      }
    }
    return { success: false, error: error.response?.data || error.message };
  }
}

module.exports = {
  getConfigStatus,
  getPayConfigStatus,
  ensurePaymentConfigured,
  createJsapiOrder,
  createNativeOrder,
  generateMiniProgramPayParams,
  handlePaymentNotify,
  generateNotifyResponse,
  queryOrder,
  closeOrder,
  generateNonceStr
};
