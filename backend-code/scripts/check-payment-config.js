/**
 * 微信支付配置检查脚本
 * 用于验证所有配置是否正确
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

console.log('========================================');
console.log('🔍 微信支付配置检查');
console.log('========================================\n');

let hasErrors = false;

// 检查1: 环境变量
console.log('📋 检查环境变量配置...\n');

const requiredEnvVars = [
  { key: 'WECHAT_APP_ID', name: '小程序AppID' },
  { key: 'WECHAT_APP_SECRET', name: '小程序AppSecret' },
  { key: 'WECHAT_MCH_ID', name: '商户号' },
  { key: 'WECHAT_APIV3_KEY', name: 'APIv3密钥' },
  { key: 'WECHAT_CERT_SERIAL', name: '证书序列号' },
  { key: 'WECHAT_NOTIFY_URL', name: '支付回调地址' }
];

requiredEnvVars.forEach(({ key, name }) => {
  const value = process.env[key];
  if (!value || value.includes('your_') || value.includes('YOUR_')) {
    console.log(`❌ ${name} (${key}): 未配置或使用了默认值`);
    hasErrors = true;
  } else {
    // 隐藏敏感信息
    const displayValue = key.includes('SECRET') || key.includes('KEY') 
      ? `${value.substring(0, 10)}***` 
      : value;
    console.log(`✅ ${name} (${key}): ${displayValue}`);
  }
});

// 检查商户号格式
const mchId = process.env.WECHAT_MCH_ID;
if (mchId === '1730723347') {
  console.log('✅ 商户号格式正确: 1730723347');
} else if (mchId && mchId.length === 10 && /^\d+$/.test(mchId)) {
  console.log(`✅ 商户号格式正确: ${mchId}`);
} else {
  console.log(`❌ 商户号格式错误: ${mchId} (应为10位数字)`);
  hasErrors = true;
}

// 检查APIv3密钥长度
const apiV3Key = process.env.WECHAT_APIV3_KEY;
if (apiV3Key && apiV3Key.length === 32) {
  console.log('✅ APIv3密钥长度正确: 32位');
} else {
  console.log(`❌ APIv3密钥长度错误: ${apiV3Key?.length || 0}位 (应为32位)`);
  hasErrors = true;
}

// 检查回调地址
const notifyUrl = process.env.WECHAT_NOTIFY_URL;
if (notifyUrl && notifyUrl.startsWith('https://')) {
  console.log(`✅ 回调地址使用HTTPS: ${notifyUrl}`);
} else if (notifyUrl && notifyUrl.startsWith('http://')) {
  console.log(`⚠️  回调地址使用HTTP（生产环境必须使用HTTPS）: ${notifyUrl}`);
} else {
  console.log(`❌ 回调地址格式错误: ${notifyUrl}`);
  hasErrors = true;
}

console.log('\n========================================');
console.log('📁 检查证书文件...\n');

// 检查2: 证书文件
const certPath = process.env.WECHAT_PRIVATE_KEY_PATH
  ? path.resolve(process.env.WECHAT_PRIVATE_KEY_PATH)
  : path.join(__dirname, '../certs/apiclient_key.pem');
const certExists = fs.existsSync(certPath);
const privateKeyEnv = process.env.WECHAT_PRIVATE_KEY;
const privateKeyBase64 = process.env.WECHAT_PRIVATE_KEY_BASE64;

if (privateKeyEnv || privateKeyBase64) {
  try {
    const keyContent = privateKeyEnv
      ? privateKeyEnv.replace(/\\n/g, '\n')
      : Buffer.from(privateKeyBase64, 'base64').toString('utf8');
    if (keyContent.includes('-----BEGIN PRIVATE KEY-----')) {
      console.log(`✅ 商户私钥已通过 ${privateKeyEnv ? 'WECHAT_PRIVATE_KEY' : 'WECHAT_PRIVATE_KEY_BASE64'} 配置`);
    } else {
      console.log('❌ 环境变量中的商户私钥格式错误');
      hasErrors = true;
    }
  } catch (error) {
    console.log(`❌ 环境变量中的商户私钥无法读取: ${error.message}`);
    hasErrors = true;
  }
}

if (certExists) {
    console.log(`✅ 商户私钥文件存在: ${certPath}`);
  
  // 检查文件内容
  try {
    const certContent = fs.readFileSync(certPath, 'utf-8');
    if (certContent.includes('-----BEGIN PRIVATE KEY-----')) {
      console.log('✅ 证书文件格式正确');
    } else {
      console.log('❌ 证书文件格式错误（应包含 -----BEGIN PRIVATE KEY-----）');
      hasErrors = true;
    }
    
    // 检查文件大小
    const stats = fs.statSync(certPath);
    console.log(`✅ 证书文件大小: ${stats.size} bytes`);
  } catch (error) {
    console.log(`❌ 读取证书文件失败: ${error.message}`);
    hasErrors = true;
  }
} else {
  if (privateKeyEnv || privateKeyBase64) {
    console.log('ℹ️ 未挂载证书文件，当前使用环境变量中的商户私钥');
  } else {
    console.log('❌ 商户私钥未配置：请设置 WECHAT_PRIVATE_KEY_PATH、WECHAT_PRIVATE_KEY、WECHAT_PRIVATE_KEY_BASE64，或挂载 backend-code/certs/apiclient_key.pem');
    hasErrors = true;
  }
}

// 检查辅助证书文件
const certFilePath = path.join(__dirname, '../certs/apiclient_cert.pem');
if (fs.existsSync(certFilePath)) {
  console.log('✅ 商户证书存在: backend-code/certs/apiclient_cert.pem');
} else {
  console.log('⚠️  商户证书不存在（非必需，但建议保留）');
}

console.log('\n========================================');
console.log('🔐 检查Git安全配置...\n');

// 检查3: .gitignore
const gitignorePath = path.join(__dirname, '../../.gitignore');
if (fs.existsSync(gitignorePath)) {
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
  
  if (gitignoreContent.includes('*.pem')) {
    console.log('✅ .gitignore 已配置忽略 *.pem');
  } else {
    console.log('❌ .gitignore 未配置忽略 *.pem');
    hasErrors = true;
  }
  
  if (gitignoreContent.includes('.env')) {
    console.log('✅ .gitignore 已配置忽略 .env');
  } else {
    console.log('❌ .gitignore 未配置忽略 .env');
    hasErrors = true;
  }
} else {
  console.log('⚠️  .gitignore 文件不存在');
}

console.log('\n========================================');
console.log('📡 检查API路由...\n');

// 检查4: API路由文件
const routePath = path.join(__dirname, '../routes/wechat-pay.js');
if (fs.existsSync(routePath)) {
  console.log('✅ 支付路由文件存在: routes/wechat-pay.js');
  
  const routeContent = fs.readFileSync(routePath, 'utf-8');
  const requiredEndpoints = [
    '/create-order',
    '/notify',
    '/check-first-recharge',
    '/mock-success'
  ];
  
  requiredEndpoints.forEach(endpoint => {
    if (routeContent.includes(endpoint)) {
      console.log(`✅ API路由已配置: ${endpoint}`);
    } else {
      console.log(`❌ API路由缺失: ${endpoint}`);
      hasErrors = true;
    }
  });
} else {
  console.log('❌ 支付路由文件不存在: routes/wechat-pay.js');
  hasErrors = true;
}

console.log('\n========================================');
console.log('📊 配置检查结果\n');

if (hasErrors) {
  console.log('❌ 发现配置问题，请根据上述提示修复');
  console.log('\n建议：');
  console.log('1. 检查 backend-code/.env 文件中的配置');
  console.log('2. 确认证书文件已正确放置');
  console.log('3. 查看文档：PAYMENT_READY.md');
  console.log('========================================\n');
  process.exit(1);
} else {
  console.log('🎉 所有配置检查通过！');
  console.log('\n✅ 环境变量配置完整');
  console.log('✅ 证书文件已正确放置');
  console.log('✅ Git安全配置正确');
  console.log('✅ API路由文件完整');
  console.log('\n🚀 可以启动服务了！');
  console.log('\n运行命令：');
  console.log('  cd backend-code');
  console.log('  npm start');
  console.log('========================================\n');
  process.exit(0);
}


