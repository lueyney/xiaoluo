/**
 * 短信发送工具（腾讯云短信）
 * 所有登录 / 修改密码等场景统一从这里发短信
 */

const tencentcloud = require('tencentcloud-sdk-nodejs');
const logger = require('./logger');

// 读取环境变量
const SMS_CONFIG = {
  secretId: process.env.TENCENT_SMS_SECRET_ID || process.env.SMS_ACCESS_KEY,
  secretKey: process.env.TENCENT_SMS_SECRET_KEY || process.env.SMS_SECRET_KEY,
  appId: process.env.TENCENT_SMS_APP_ID || process.env.SMS_APP_ID,          // SmsSdkAppId
  signName: process.env.TENCENT_SMS_SIGN_NAME || process.env.SMS_SIGN_NAME,    // 签名
  // 模板：兼容新旧环境变量命名
  templateIdLogin:
    process.env.TENCENT_SMS_TEMPLATE_ID_LOGIN ||
    process.env.TENCENT_SMS_TEMPLATE_ID ||
    process.env.SMS_TEMPLATE_ID_LOGIN ||
    process.env.SMS_TEMPLATE_ID, // 登录 / 通用验证码
  region: process.env.TENCENT_SMS_REGION || process.env.SMS_REGION || 'ap-guangzhou'
};

let smsClient = null;

function ensureClient() {
  if (smsClient) return smsClient;

  // 详细检查每个环境变量
  const missingVars = [];
  if (!SMS_CONFIG.secretId) missingVars.push('TENCENT_SMS_SECRET_ID');
  if (!SMS_CONFIG.secretKey) missingVars.push('TENCENT_SMS_SECRET_KEY');
  if (!SMS_CONFIG.appId) missingVars.push('TENCENT_SMS_APP_ID');
  if (!SMS_CONFIG.signName) missingVars.push('TENCENT_SMS_SIGN_NAME');
  
  if (missingVars.length > 0) {
    const errorMsg = `短信服务未正确配置，缺少环境变量: ${missingVars.join(', ')}。请检查环境变量配置并重启服务。`;
    logger.error('[SMS] 配置检查失败', {
      missingVars,
      hasSecretId: !!SMS_CONFIG.secretId,
      hasSecretKey: !!SMS_CONFIG.secretKey,
      hasAppId: !!SMS_CONFIG.appId,
      hasSignName: !!SMS_CONFIG.signName
    });
    throw new Error(errorMsg);
  }

  const SmsClient = tencentcloud.sms.v20210111.Client;
  smsClient = new SmsClient({
    credential: {
      secretId: SMS_CONFIG.secretId,
      secretKey: SMS_CONFIG.secretKey
    },
    region: SMS_CONFIG.region,
    profile: {
      httpProfile: {
        endpoint: 'sms.tencentcloudapi.com'
      }
    }
  });

  return smsClient;
}

/**
 * 发送登录 / 通用验证码短信
 * @param {string} phone 手机号（11位，不含国家码）
 * @param {string} code 验证码
 * @param {string} scene 业务场景 login/register/password_reset
 */
async function sendLoginCode(phone, code, scene = 'login') {
  if (!SMS_CONFIG.secretId || !SMS_CONFIG.secretKey || !SMS_CONFIG.appId || !SMS_CONFIG.signName || !SMS_CONFIG.templateIdLogin) {
    const missing = [];
    if (!SMS_CONFIG.secretId) missing.push('TENCENT_SMS_SECRET_ID');
    if (!SMS_CONFIG.secretKey) missing.push('TENCENT_SMS_SECRET_KEY');
    if (!SMS_CONFIG.appId) missing.push('TENCENT_SMS_APP_ID');
    if (!SMS_CONFIG.signName) missing.push('TENCENT_SMS_SIGN_NAME');
    if (!SMS_CONFIG.templateIdLogin) missing.push('TENCENT_SMS_TEMPLATE_ID_LOGIN/TENCENT_SMS_TEMPLATE_ID');
    const msg = `短信服务未配置完整: ${missing.join(', ')}`;
    logger.error(`[SMS] ${msg}`);
    throw new Error(msg);
  }

  const client = ensureClient();

  const templateId = SMS_CONFIG.templateIdLogin;

  // 模板变量配置
  // 模板内容：「验证码：{1}，有效期1分钟，若非本人操作，请勿泄露。」
  // 模板只有1个变量 {1}，所以只需要传1个参数：验证码
  const templateParams = [code];

  // 确保参数类型正确（腾讯云要求字符串类型）
  const params = {
    PhoneNumberSet: [`+86${phone}`],  // E.164 格式：+[国家码][手机号]
    SmsSdkAppId: String(SMS_CONFIG.appId),  // 确保是字符串类型
    SignName: String(SMS_CONFIG.signName),  // UTF-8 编码的签名
    TemplateId: String(templateId),  // 确保是字符串类型
    TemplateParamSet: templateParams.map(p => String(p))  // 确保所有参数都是字符串
  };

  logger.info('[SMS] 准备发送验证码短信', {
    phone: `+86${phone}`,
    scene,
    templateId,
    signName: SMS_CONFIG.signName,
    appId: SMS_CONFIG.appId,
    templateParams: templateParams
  });

  try {
    const res = await client.SendSms(params);
    
    // 腾讯云 SDK 返回格式：{ Response: { SendStatusSet: [...], RequestId: "..." } }
    const rsp = res?.Response || res || {};
    const sendStatusSet = rsp.SendStatusSet || [];
    const first = sendStatusSet[0] || {};

    // 记录完整响应（用于调试）
    logger.info('[SMS] 腾讯云响应', {
      phone: `+86${phone}`,
      requestId: rsp.RequestId,
      statusCount: sendStatusSet.length,
      firstStatus: first
    });

    // 检查发送状态
    if (first.Code !== 'Ok') {
      logger.error('[SMS] 短信发送失败', {
        phone: `+86${phone}`,
        code: first.Code,
        message: first.Message,
        fullResponse: first
      });
      throw new Error(first.Message || first.Code || '短信发送失败');
    }

    logger.info('[SMS] 短信发送成功', {
      phone: `+86${phone}`,
      serialNo: first.SerialNo,
      fee: first.Fee,
      requestId: rsp.RequestId
    });
  } catch (err) {
    logger.error('[SMS] 调用腾讯云短信失败', {
      phone: `+86${phone}`,
      message: err.message,
      stack: err.stack
    });
    throw err;
  }
}

module.exports = {
  sendLoginCode
};



