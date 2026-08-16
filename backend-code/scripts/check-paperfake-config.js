/**
 * PaperFake降重API配置检查脚本
 * 用于诊断降重功能无法使用的问题
 */

require('dotenv').config();

console.log('========================================');
console.log('🔍 PaperFake降重API配置检查');
console.log('========================================\n');

// 检查环境变量
const username = process.env.PAPERFAKE_USERNAME;
const password = process.env.PAPERFAKE_PASSWORD;
const baseURL = process.env.PAPERFAKE_API_BASE || 'https://paperfake.cn/pcserver';

console.log('📋 配置信息:');
console.log(`   API地址: ${baseURL}`);
console.log(`   用户名: ${username ? `${username.substring(0, 3)}***` : '❌ 未设置'}`);
console.log(`   密码: ${password ? '***已设置***' : '❌ 未设置'}\n`);

// 检查配置完整性
let hasError = false;

if (!username) {
  console.log('❌ 错误: PAPERFAKE_USERNAME 环境变量未设置');
  hasError = true;
}

if (!password) {
  console.log('❌ 错误: PAPERFAKE_PASSWORD 环境变量未设置');
  hasError = true;
}

if (hasError) {
  console.log('\n💡 解决方案:');
  console.log('   1. 在 .env 文件中添加以下配置:');
  console.log('      PAPERFAKE_USERNAME=你的用户名');
  console.log('      PAPERFAKE_PASSWORD=你的密码');
  console.log('      PAPERFAKE_API_BASE=https://paperfake.cn/pcserver');
  console.log('   2. 重启后端服务');
  console.log('   3. 如果使用云托管，请在环境变量配置中添加这些变量\n');
  process.exit(1);
}

console.log('✅ 配置检查通过\n');

// 尝试测试连接（可选）
const axios = require('axios');

console.log('🔗 测试API连接...');
axios.post(
  `${baseURL}/sa/saReduceAIGCTextV2`,
  {
    text: '测试文本',
    lang: 'zh',
    reduceRepeat: false,
    sa_username: username,
    sa_password: password,
    zhPlatform: 'cnki'
  },
  {
    headers: {
      'Content-Type': 'application/json'
    },
    timeout: 10000
  }
)
  .then(response => {
    console.log('✅ API连接成功');
    console.log(`   响应状态: ${response.status}`);
    if (response.data.errCode === 0) {
      console.log('✅ API认证成功');
    } else {
      console.log(`⚠️  API返回错误码: ${response.data.errCode}`);
      console.log(`   错误信息: ${response.data.msg || response.data.message || '未知错误'}`);
    }
    console.log('\n========================================');
    process.exit(0);
  })
  .catch(error => {
    if (error.code === 'ECONNABORTED') {
      console.log('❌ API请求超时');
    } else if (error.response) {
      console.log(`❌ API返回错误: ${error.response.status}`);
      console.log(`   错误信息: ${JSON.stringify(error.response.data).substring(0, 200)}`);
    } else if (error.request) {
      console.log('❌ 无法连接到API服务器');
      console.log(`   错误: ${error.message}`);
    } else {
      console.log(`❌ 请求配置错误: ${error.message}`);
    }
    console.log('\n💡 可能的原因:');
    console.log('   1. 网络连接问题');
    console.log('   2. API服务器暂时不可用');
    console.log('   3. 用户名或密码错误');
    console.log('   4. API地址配置错误');
    console.log('\n========================================');
    process.exit(1);
  });















