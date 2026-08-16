# 抖音支付实现指南

## ✅ 已完成的核心功能

### 1. 抖音支付签名算法
- ✅ 在 `backend-code/utils/douyin.js` 中实现了 `generateDouyinSign()` 函数
- ✅ 签名算法：MD5 + Salt，按 key 的 ASCII 码排序，只拼接 value
- ✅ 签名格式：`value1&value2&salt` → MD5

### 2. 后端支付接口完善
- ✅ `backend-code/routes/douyin-pay.js` 已更新：
  - 使用 `generateDouyinSign()` 生成签名
  - 支持 `anonymousCode` 参数
  - 返回格式适配抖音 `tt.pay`（`order_id` 和 `order_token`）

### 3. 前端登录逻辑
- ✅ `ttcode/components/phone-login-modal/index.js`：
  - 传递 `anonymous_code` 给后端
  - 所有 `wx.` 已替换为 `tt.`

### 4. 前端支付逻辑
- ✅ `ttcode/pages/recharge/index.js`：
  - 传递 `anonymous_code` 给后端
  - `tt.pay` 参数格式：`{ order_id, order_token }`
  - 所有 `wx.` 已替换为 `tt.`

## 📋 环境变量配置

在 `backend-code/.env` 文件中添加以下配置：

```env
# 抖音小程序配置
DOUYIN_APP_ID=ttxxxxxxxx          # 抖音小程序 AppID
DOUYIN_APP_SECRET=skxxxxxxxx       # 抖音小程序 AppSecret

# 抖音支付配置
DOUYIN_MERCHANT_ID=xxxxxxxx       # 抖音商户号
DOUYIN_SALT=xxxxxxxx              # 抖音支付签名用的 SALT（在开发者后台查看）
```

## ⚠️ 待完善的工作

### 1. 抖音支付预下单 API 调用

在 `backend-code/routes/douyin-pay.js` 的 `create-order` 接口中，需要实现真实的抖音支付预下单 API 调用。

**当前状态**：代码中已有注释说明，但实际 API 调用被注释掉了。

**需要完成**：
1. 根据抖音官方文档确定预下单 API 地址
2. 构建完整的请求参数（包括签名）
3. 调用抖音 API 获取 `order_id` 和 `order_token`
4. 返回给前端

**参考文档**：
- https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/ecpay/pay-list/pay

**示例代码位置**：
```javascript
// backend-code/routes/douyin-pay.js
// 第 179-204 行，需要取消注释并实现真实 API 调用
```

### 2. 抖音支付回调验签

在 `backend-code/routes/douyin-pay.js` 的 `/notify` 接口中，需要实现回调验签逻辑。

**当前状态**：回调处理逻辑已实现，但验签部分被注释掉了。

**需要完成**：
1. 从回调请求中提取参数
2. 使用 `generateDouyinSign()` 验证签名
3. 验证通过后再处理订单

### 3. 隐私协议配置

**重要**：抖音对隐私保护要求严格，必须在后台配置隐私协议，否则 `tt.login` 会失败。

**操作步骤**：
1. 登录抖音开放平台：https://developer.open-douyin.com/
2. 进入控制台 → 小程序 → 用户隐私保护指引
3. 配置以下内容：
   - 声明收集"用户信息"（用于创建账号）
   - 声明收集"手机号"（用于登录和同步数据）
   - 说明用途和范围
4. 提交审核
5. 审核通过后，真机上的登录功能才能正常使用

## 🔧 代码使用说明

### 签名函数使用示例

```javascript
const { generateDouyinSign } = require('../utils/douyin');

const params = {
  app_id: 'tt123456',
  merchant_id: 'merchant123',
  out_order_no: 'ORDER123456',
  total_amount: 100,
  subject: '测试订单'
};

const salt = process.env.DOUYIN_SALT;
const sign = generateDouyinSign(params, salt);

// 将签名添加到参数中
params.sign = sign;
```

### 前端支付调用示例

```javascript
// 后端返回的 payInfo 格式
const payInfo = {
  order_id: 'douyin_order_123',
  order_token: 'token_abc123'
};

// 前端调用
tt.pay({
  orderInfo: {
    order_id: payInfo.order_id,
    order_token: payInfo.order_token
  },
  success: (res) => {
    console.log('支付成功', res);
    // 立即查询订单状态
  },
  fail: (err) => {
    console.error('支付失败', err);
  }
});
```

## 📝 注意事项

1. **签名算法特殊性**：
   - 抖音签名只需要 value，不需要 key=value 格式
   - 必须按 key 的 ASCII 码排序
   - 最后追加 salt，然后 MD5

2. **支付参数格式**：
   - 抖音 `tt.pay` 只需要 `order_id` 和 `order_token`
   - 不需要像微信那样传递多个参数

3. **anonymous_code**：
   - 抖音官方建议传递 `anonymous_code`
   - 虽然只传 `code` 也能用，但传递 `anonymous_code` 更规范

4. **环境变量**：
   - 配置完环境变量后，需要重启后端服务才能生效
   - 如果使用云托管，需要重新部署

## 🚀 测试步骤

1. **配置环境变量**：在 `.env` 文件中添加抖音相关配置
2. **执行数据库脚本**：`source backend-code/database/add_douyin_openid.sql`
3. **重启后端服务**：确保环境变量生效
4. **配置隐私协议**：在抖音开放平台配置用户隐私保护指引
5. **测试登录**：在抖音开发者工具中测试登录功能
6. **测试支付**：在抖音开发者工具中测试支付功能（需要完善预下单 API 调用）

## 📚 参考资源

- 抖音小程序开发文档：https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/guide/introduction
- 抖音支付文档：https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/ecpay/pay-list/pay
- 抖音登录文档：https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/log-in/log-in


