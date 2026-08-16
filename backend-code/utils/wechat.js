const axios = require('axios');
const crypto = require('crypto');
const logger = require('./logger');

// access_token 缓存
let accessTokenCache = {
  token: '',
  expiresAt: 0
};

/**
 * 获取微信 access_token（带缓存）
 * @returns {Promise<string|null>} access_token 或 null
 */
async function getAccessToken() {
  const now = Date.now();
  
  // 如果缓存有效，直接返回
  if (accessTokenCache.token && accessTokenCache.expiresAt > now) {
    logger.info('使用缓存的 access_token');
    return accessTokenCache.token;
  }
  
  // 从环境变量获取配置
  const appId = process.env.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;
  
  logger.info(`AppID: ${appId ? appId.substring(0, 10) + '...' : '未配置'}`);
  logger.info(`AppSecret: ${appSecret ? '已配置' : '未配置'}`);
  
  if (!appId || !appSecret) {
    logger.error('未配置 WECHAT_APP_ID 或 WECHAT_APP_SECRET');
    return null;
  }
  
  try {
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
    logger.info('正在获取 access_token...');
    
    const response = await axios.get(url, { timeout: 10000 });
    
    logger.info('微信响应:', JSON.stringify(response.data));
    
    if (response.data && response.data.access_token) {
      const token = response.data.access_token;
      const expiresIn = response.data.expires_in || 7200;
      
      // 缓存token，提前200秒过期以确保安全
      accessTokenCache = {
        token: token,
        expiresAt: now + (expiresIn - 200) * 1000
      };
      
      logger.info('✅ 成功获取 access_token');
      return token;
    } else {
      logger.error('❌ 获取 access_token 失败，微信返回:', response.data);
      return null;
    }
  } catch (error) {
    logger.error('❌ 请求 access_token 异常:', {
      message: error.message,
      code: error.code,
      response: error.response?.data
    });
    return null;
  }
}

/**
 * 通过 code 获取用户手机号
 * @param {string} code - 前端传来的 code
 * @returns {Promise<Object|null>} 返回手机号信息或 null
 */
async function getUserPhoneNumber(code) {
  if (!code) {
    logger.error('getUserPhoneNumber: code 为空');
    return null;
  }
  
  // 获取 access_token
  const accessToken = await getAccessToken();
  if (!accessToken) {
    logger.error('getUserPhoneNumber: 无法获取 access_token');
    return null;
  }
  
  try {
    const url = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`;
    const response = await axios.post(url, { code }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    
    const data = response.data;
    
    if (data.errcode === 0 && data.phone_info) {
      const phoneInfo = data.phone_info;
      logger.info('成功获取用户手机号');
      return {
        purePhoneNumber: phoneInfo.purePhoneNumber, // 没有区号的手机号
        phoneNumber: phoneInfo.phoneNumber, // 带区号的手机号
        countryCode: phoneInfo.countryCode, // 国家码
        watermark: phoneInfo.watermark // 数据水印
      };
    } else {
      logger.error('获取手机号失败:', {
        errcode: data.errcode,
        errmsg: data.errmsg
      });
      return null;
    }
  } catch (error) {
    logger.error('请求微信手机号接口异常:', error.message);
    return null;
  }
}

/**
 * 通过 code 获取 session_key 和 openid
 * @param {string} code - 前端 wx.login 获取的 code
 * @returns {Promise<Object|null>} 返回 { openid, session_key } 或 null
 */
async function code2Session(code) {
  const appId = process.env.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;
  
  if (!appId || !appSecret) {
    logger.error('code2Session: 未配置 WECHAT_APP_ID 或 WECHAT_APP_SECRET');
    return null;
  }
  
  try {
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${appSecret}&js_code=${code}&grant_type=authorization_code`;
    logger.info(`code2Session 请求URL: ${url.substring(0, 80)}...`);
    
    const response = await axios.get(url, { 
      timeout: 15000,
      httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: false // 开发环境允许自签名证书
      })
    });
    
    const data = response.data;
    logger.info('code2Session 响应:', JSON.stringify(data));
    
    if (data.openid && data.session_key) {
      logger.info('code2Session 成功');
      return {
        openid: data.openid,
        sessionKey: data.session_key,
        unionid: data.unionid
      };
    } else {
      logger.error('code2Session 失败，微信返回:', data);
      return null;
    }
  } catch (error) {
    logger.error('code2Session 网络请求异常:', {
      message: error.message,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status
    });
    return null;
  }
}

/**
 * 解密微信加密数据（手机号）
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
    
    // 解密使用 AES-128-CBC
    const decipher = crypto.createDecipheriv('aes-128-cbc', sessionKeyBuffer, ivBuffer);
    decipher.setAutoPadding(true);
    
    let decrypted = decipher.update(encryptedDataBuffer, null, 'utf8');
    decrypted += decipher.final('utf8');
    
    const result = JSON.parse(decrypted);
    logger.info('解密成功');
    return result;
  } catch (error) {
    logger.error('解密失败:', error.message);
    return null;
  }
}

/**
 * 清除 access_token 缓存（用于强制刷新）
 */
function clearAccessTokenCache() {
  accessTokenCache = {
    token: '',
    expiresAt: 0
  };
  logger.info('access_token 缓存已清除');
}

module.exports = {
  getAccessToken,
  getUserPhoneNumber,
  code2Session,
  decryptData,
  clearAccessTokenCache
};

