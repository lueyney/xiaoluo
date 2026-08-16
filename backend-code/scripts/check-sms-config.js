/**
 * 短信服务配置检查脚本
 * 用于诊断短信发送功能问题
 */

require('dotenv').config();
const logger = require('../utils/logger');

console.log('📱 短信服务配置检查\n');
console.log('='.repeat(50));

// 检查环境变量
console.log('\n📋 检查环境变量配置...\n');

const requiredEnvVars = [
  { key: 'TENCENT_SMS_SECRET_ID', name: '腾讯云SecretId' },
  { key: 'TENCENT_SMS_SECRET_KEY', name: '腾讯云SecretKey' },
  { key: 'TENCENT_SMS_APP_ID', name: '短信应用ID (SmsSdkAppId)' },
  { key: 'TENCENT_SMS_SIGN_NAME', name: '短信签名' },
  { key: 'TENCENT_SMS_TEMPLATE_ID_LOGIN', name: '验证码模板ID' }
];

let hasErrors = false;
const config = {};

requiredEnvVars.forEach(({ key, name }) => {
  const value = process.env[key];
  if (!value || value.includes('your_') || value.includes('YOUR_')) {
    console.log(`❌ ${name} (${key}): 未配置或使用了默认值`);
    hasErrors = true;
    config[key] = null;
  } else {
    // 隐藏敏感信息
    const displayValue = key.includes('SECRET') || key.includes('KEY') 
      ? `${value.substring(0, 10)}***` 
      : value;
    console.log(`✅ ${name} (${key}): ${displayValue}`);
    config[key] = value;
  }
});

// 检查可选配置
const region = process.env.TENCENT_SMS_REGION || 'ap-guangzhou';
console.log(`\n📍 区域配置: ${region}`);

if (hasErrors) {
  console.log('\n❌ 配置检查失败！');
  console.log('\n💡 解决方案:');
  console.log('   1. 在 .env 文件中添加以下配置:');
  console.log('      TENCENT_SMS_SECRET_ID=你的SecretId');
  console.log('      TENCENT_SMS_SECRET_KEY=你的SecretKey');
  console.log('      TENCENT_SMS_APP_ID=你的应用ID');
  console.log('      TENCENT_SMS_SIGN_NAME=你的签名');
  console.log('      TENCENT_SMS_TEMPLATE_ID_LOGIN=你的模板ID');
  console.log('   2. 重启后端服务');
  console.log('   3. 如果使用云托管，请在环境变量配置中添加这些变量\n');
  process.exit(1);
}

console.log('\n✅ 环境变量配置检查通过\n');

// 尝试初始化短信客户端
console.log('🔧 测试短信客户端初始化...\n');

try {
  const tencentcloud = require('tencentcloud-sdk-nodejs');
  const SmsClient = tencentcloud.sms.v20210111.Client;
  
  const smsClient = new SmsClient({
    credential: {
      secretId: config.TENCENT_SMS_SECRET_ID,
      secretKey: config.TENCENT_SMS_SECRET_KEY
    },
    region: region,
    profile: {
      httpProfile: {
        endpoint: 'sms.tencentcloudapi.com'
      }
    }
  });
  
  console.log('✅ 短信客户端初始化成功\n');
  
  // 检查配置值
  console.log('📝 配置详情:');
  console.log(`   应用ID: ${config.TENCENT_SMS_APP_ID}`);
  console.log(`   签名: ${config.TENCENT_SMS_SIGN_NAME}`);
  console.log(`   模板ID: ${config.TENCENT_SMS_TEMPLATE_ID_LOGIN}`);
  console.log(`   区域: ${region}`);
  
  console.log('\n💡 常见问题排查:');
  console.log('   1. 如果环境变量已配置但仍收不到短信，请检查:');
  console.log('      - 腾讯云控制台中的短信签名和模板是否已审核通过');
  console.log('      - 手机号格式是否正确（11位，不含国家码）');
  console.log('      - 腾讯云账户是否有足够的余额');
  console.log('      - 查看后端日志 logs/combined.log 和 logs/error.log');
  console.log('   2. 如果看到 "[SMS] 短信服务未完全配置，跳过真实发送" 的警告，');
  console.log('      说明环境变量未正确加载，需要重启服务');
  console.log('   3. 如果看到 "[SMS] 短信发送失败" 的错误，');
  console.log('      请查看错误详情，可能是签名/模板ID不匹配或账户问题');
  
  console.log('\n✅ 配置检查完成！\n');
  
} catch (error) {
  console.error('❌ 短信客户端初始化失败:');
  console.error(`   错误: ${error.message}`);
  console.error('\n💡 请检查:');
  console.error('   1. 是否已安装 tencentcloud-sdk-nodejs: npm install tencentcloud-sdk-nodejs');
  console.error('   2. SecretId 和 SecretKey 是否正确');
  console.error('   3. 网络连接是否正常\n');
  process.exit(1);
}

