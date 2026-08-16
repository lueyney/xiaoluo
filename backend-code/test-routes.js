/**
 * 测试微信支付路由是否正确加载
 */

console.log('========================================');
console.log('🧪 测试微信支付路由');
console.log('========================================\n');

try {
  // 测试1: 加载路由模块
  console.log('📋 测试1: 加载路由模块...');
  const wechatPayRoutes = require('./routes/wechat-pay');
  
  if (typeof wechatPayRoutes === 'function') {
    console.log('✅ 路由模块加载成功\n');
  } else {
    console.log('❌ 路由模块类型错误:', typeof wechatPayRoutes, '\n');
    process.exit(1);
  }

  // 测试2: 检查路由栈
  console.log('📋 测试2: 检查路由配置...');
  const routeStack = wechatPayRoutes.stack || [];
  console.log(`   找到 ${routeStack.length} 个路由\n`);

  if (routeStack.length > 0) {
    console.log('📍 已注册的路由：');
    routeStack.forEach((layer, index) => {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
        const path = layer.route.path;
        console.log(`   ${index + 1}. ${methods.padEnd(6)} ${path}`);
      }
    });
    console.log('');
  }

  // 测试3: 验证关键路由
  console.log('📋 测试3: 验证关键路由...');
  const requiredRoutes = [
    '/create-order',
    '/notify',
    '/check-first-recharge',
    '/mock-success'
  ];

  const foundRoutes = routeStack
    .filter(layer => layer.route)
    .map(layer => layer.route.path);

  let allFound = true;
  requiredRoutes.forEach(route => {
    const found = foundRoutes.includes(route);
    if (found) {
      console.log(`   ✅ ${route}`);
    } else {
      console.log(`   ❌ ${route} - 未找到`);
      allFound = false;
    }
  });
  console.log('');

  // 测试4: 检查依赖模块
  console.log('📋 测试4: 检查依赖模块...');
  try {
    const wechatPayV3 = require('./utils/wechat-pay-v3');
    console.log('   ✅ wechat-pay-v3.js');
  } catch (e) {
    console.log('   ❌ wechat-pay-v3.js -', e.message);
    allFound = false;
  }

  try {
    const wechatUtil = require('./utils/wechat');
    console.log('   ✅ wechat.js');
  } catch (e) {
    console.log('   ❌ wechat.js -', e.message);
    allFound = false;
  }
  console.log('');

  // 最终结果
  console.log('========================================');
  if (allFound) {
    console.log('🎉 所有测试通过！');
    console.log('');
    console.log('✅ 路由模块正确');
    console.log('✅ 所有关键路由已配置');
    console.log('✅ 依赖模块完整');
    console.log('');
    console.log('🚀 可以启动服务了：npm start');
    console.log('========================================\n');
    process.exit(0);
  } else {
    console.log('❌ 发现配置问题');
    console.log('请检查上述错误并修复');
    console.log('========================================\n');
    process.exit(1);
  }

} catch (error) {
  console.log('========================================');
  console.log('❌ 测试失败');
  console.log('');
  console.log('错误信息:', error.message);
  console.log('');
  if (error.stack) {
    console.log('错误堆栈:');
    console.log(error.stack);
  }
  console.log('========================================\n');
  process.exit(1);
}


