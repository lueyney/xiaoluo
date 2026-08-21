/**
 * 微信支付配置检查脚本。不输出任何密钥或私钥内容。
 * 运行：npm run check-wechat-pay
 */

require('../config/load-env');
const { buildPaymentConfig, publicConfigStatus } = require('../utils/wechat-pay-config');

const state = buildPaymentConfig(process.env);
const status = publicConfigStatus(state);

console.log('========================================');
console.log('微信支付V3配置检查');
console.log('========================================');

if (status.ready) {
  console.log('✅ 配置完整且格式有效');
  console.log(`✅ 商户私钥来源: ${status.privateKeySource}`);
  console.log('部署后请重启服务，再发起一笔低金额真实支付验证下单与回调。');
  process.exit(0);
}

console.error('❌ 配置未通过检查');
status.missing.forEach((key) => console.error(`- 缺少: ${key}`));
status.invalid.forEach((item) => console.error(`- 无效: ${item.key}（${item.reason}）`));
if (status.privateKeyLoadError) {
  console.error(`- 私钥加载失败: ${status.privateKeyLoadError}`);
}
console.error('请补齐云平台环境变量或挂载私钥文件，然后重启/重新部署服务。');
process.exit(1);
