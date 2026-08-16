const axios = require('axios');
const crypto = require('crypto');
const logger = require('./logger');

/**
 * 计算抖音支付签名
 * @param {Object} params - 参与签名的参数对象
 * @param {String} salt - 抖音支付的 SALT (在开发者后台查看)，建议来自 env: DOUYIN_PAY_SALT
 * @returns {String} 签名字符串
 */
function generateDouyinSign(params, salt) {
  // 1. 提取所有 value，过滤空值
  const values = [];
  // 抖音签名的怪癖：不需要 key，只需要 value，但必须按 key 的 ASCII 码排序
  const sortedKeys = Object.keys(params).sort();
  
  sortedKeys.forEach(key => {
    const val = params[key];
    // 排除 sign 字段本身，且值不能为空
    if (key !== 'sign' && val !== null && val !== undefined && val !== '') {
      // 注意：value 必须转为字符串
      values.push(String(val));
    }
  });

  // 2. 在最后追加 salt
  values.push(salt);

  // 3. 将数组用 & 拼接 (注意：不是 key=value，而是直接拼接 value)
  // 例：value1&value2&salt
  const signStr = values.join('&');

  // 4. MD5 加密
  return crypto.createHash('md5').update(signStr).digest('hex');
}

/**
 * 抖音 jscode2session
 * 调用抖音开放平台 API 获取 session_key 和 openid
 * @param {string} code - 前端 tt.login 获取的 code
 * @returns {Promise<Object|null>} 返回 { openid, session_key } 或 null
 */
async function code2Session(code) {
  const appId = process.env.DOUYIN_APP_ID;
  const appSecret = process.env.DOUYIN_APP_SECRET;
  
  if (!appId || !appSecret) {
    logger.error('code2Session: 未配置 DOUYIN_APP_ID 或 DOUYIN_APP_SECRET');
    return null;
  }
  
  try {
    // 抖音 jscode2session API
    const url = 'https://developer.toutiao.com/api/apps/v2/jscode2session';
    
    const requestData = {
      appid: appId,
      secret: appSecret,
      code: code
      // 注意：如果前端提供了 anonymous_code，也可以在这里传递
      // anonymous_code: anonymousCode
    };
    
    logger.info(`抖音 code2Session 请求: appid=${appId.substring(0, 10)}..., code=${code.substring(0, 10)}...`);
    
    const response = await axios.post(url, requestData, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    });
    
    const data = response.data;
    logger.info('抖音 code2Session 响应:', JSON.stringify(data));
    
    // 抖音 API 返回格式: { err_no: 0, err_tips: 'success', data: { session_key, openid } }
    if (data.err_no === 0 && data.data) {
      logger.info('抖音 code2Session 成功');
      return {
        openid: data.data.openid,
        sessionKey: data.data.session_key,
        anonymous_openid: data.data.anonymous_openid // 抖音特有的匿名 openid
      };
    } else {
      logger.error('抖音 code2Session 失败，返回:', data);
      return null;
    }
  } catch (error) {
    logger.error('抖音 code2Session 网络请求异常:', {
      message: error.message,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status
    });
    return null;
  }
}

/**
 * 解密抖音加密数据（手机号等）
 * @param {string} encryptedData - 加密数据
 * @param {string} iv - 初始向量
 * @param {string} sessionKey - 会话密钥
 * @returns {Object|null} 解密后的数据或 null
 */
function decryptData(encryptedData, iv, sessionKey) {
  try {
    // sessionKey、iv、encryptedData 都是 Base64 编码
    const sessionKeyBuffer = Buffer.from(sessionKey, 'base64');
    const encryptedDataBuffer = Buffer.from(encryptedData, 'base64');
    const ivBuffer = Buffer.from(iv, 'base64');
    
    logger.info('抖音解密参数:', {
      sessionKeyLength: sessionKey.length,
      encryptedDataLength: encryptedData.length,
      ivLength: iv.length
    });
    
    // 解密使用 AES-128-CBC（与微信相同）
    const decipher = crypto.createDecipheriv('aes-128-cbc', sessionKeyBuffer, ivBuffer);
    decipher.setAutoPadding(true);
    
    let decrypted = decipher.update(encryptedDataBuffer, null, 'utf8');
    decrypted += decipher.final('utf8');
    
    const result = JSON.parse(decrypted);
    logger.info('抖音数据解密成功，解密结果:', JSON.stringify(result));
    return result;
  } catch (error) {
    logger.error('抖音数据解密失败:', {
      message: error.message,
      stack: error.stack
    });
    return null;
  }
}

module.exports = {
  code2Session,
  decryptData,
  generateDouyinSign
};

