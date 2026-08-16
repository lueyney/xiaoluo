# 微信支付 V3 API 配置指南

## 📋 概述

本系统已经完整集成了微信支付 V3 API，支持小程序 JSAPI 支付。以下是详细的配置和使用说明。

## 🔑 前置条件

1. ✅ 已注册微信小程序账号
2. ✅ 已开通微信支付商户号
3. ✅ 小程序已关联微信支付商户号
4. ✅ 已下载商户API证书

## 📝 配置步骤

### 步骤1：获取微信支付参数

登录 [微信商户平台](https://pay.weixin.qq.com)，获取以下参数：

#### 1.1 小程序 AppID
- 位置：小程序后台 -> 开发 -> 开发管理 -> 开发设置
- 格式：`wx1234567890abcdef`

#### 1.2 商户号（MchID）
- 位置：商户平台首页
- 格式：10位数字，如 `1234567890`
- **注意**：您提供的"瑶光小珞"不是商户号格式，请使用实际的10位数字商户号

#### 1.3 APIv3 密钥
- 位置：商户平台 -> 账户中心 -> API安全 -> APIv3密钥
- 长度：32位字符串
- **当前配置**：`ajiof2135watgfsdg2315waq1g32sa1g`

#### 1.4 商户API证书
- 位置：商户平台 -> 账户中心 -> API安全 -> API证书
- 下载：选择"申请证书" -> 下载证书压缩包
- 包含文件：
  - `apiclient_cert.pem` - 商户证书
  - `apiclient_key.pem` - 商户私钥 ⭐
  - `apiclient_cert.p12` - PKCS12证书

#### 1.5 证书序列号
- 获取方式：查看证书详情
- 或使用命令：
  ```bash
  openssl x509 -in apiclient_cert.pem -noout -serial
  ```

### 步骤2：配置证书文件

将下载的 `apiclient_key.pem` 文件放到以下目录：

```
backend-code/
  └── certs/
      └── apiclient_key.pem  ← 商户私钥文件
```

**当前状态**：您提到证书在 `backend-code/certs/` 文件夹，但目录为空，请放置证书文件。

### 步骤3：配置环境变量

在 `backend-code/.env` 文件中添加配置：

```env
# 微信小程序配置
WECHAT_APP_ID=wx1234567890abcdef          # 替换为实际的小程序AppID
WECHAT_APP_SECRET=your_app_secret_here    # 替换为实际的AppSecret

# 微信支付V3配置
WECHAT_MCH_ID=1234567890                  # 替换为实际的商户号（10位数字）
WECHAT_APIV3_KEY=ajiof2135watgfsdg2315waq1g32sa1g
WECHAT_CERT_SERIAL=5157F09EFDC096DE15EBE81A47057A72  # 替换为实际的证书序列号
WECHAT_NOTIFY_URL=https://yourdomain.com/api/payment/wechat-notify  # 支付回调地址
```

### 步骤4：配置商户平台

#### 4.1 设置支付回调URL
- 位置：商户平台 -> 产品中心 -> 开发配置 -> 支付配置
- 设置：`https://yourdomain.com/api/payment/wechat-notify`
- **必须是 HTTPS 外网可访问地址**

#### 4.2 设置小程序支付域名
- 位置：小程序后台 -> 开发 -> 开发管理 -> 开发设置 -> 业务域名
- 添加：你的服务器域名

#### 4.3 设置IP白名单（可选）
- 位置：商户平台 -> 账户中心 -> API安全 -> IP白名单
- 添加：你的服务器公网IP

## 🔄 完整支付流程

### 阶段一：创建订单并获取支付参数

#### 第1步：前端获取code
```javascript
wx.login({
  success: (res) => {
    const code = res.code;
    // 传递给后端
  }
});
```

#### 第2步：前端发起支付请求
```javascript
wx.request({
  url: `${apiUrl}/api/payment/create-order`,
  method: 'POST',
  data: {
    code: code,           // 微信登录code
    packageId: 1,
    amount: 1.00,
    credits: 50,
    isFirstTime: true
  }
});
```

#### 第3步：后端获取openid
- 后端收到code
- 调用 `code2Session` 接口换取 `openid`
- 创建订单并关联openid

#### 第4步：后端统一下单（JSAPI下单）
- 组装订单参数
- 使用商户私钥签名
- 调用微信支付API：`POST /v3/pay/transactions/jsapi`
- 获得 `prepay_id`

#### 第5步：后端二次签名
```javascript
// 使用商户私钥对以下参数签名
{
  appId: '小程序AppID',
  timeStamp: '时间戳',
  nonceStr: '随机字符串',
  package: 'prepay_id=xxxxx',
  signType: 'RSA'
}
```

#### 第6步：后端返回支付参数
```json
{
  "code": "SUCCESS",
  "data": {
    "orderId": 123,
    "payParams": {
      "timeStamp": "1234567890",
      "nonceStr": "abc123",
      "package": "prepay_id=xxxxx",
      "signType": "RSA",
      "paySign": "BASE64_SIGNATURE"
    }
  }
}
```

### 阶段二：拉起支付并处理回调

#### 第7步：前端拉起微信支付
```javascript
wx.requestPayment({
  timeStamp: payParams.timeStamp,
  nonceStr: payParams.nonceStr,
  package: payParams.package,
  signType: 'RSA',
  paySign: payParams.paySign,
  success: (res) => {
    // 支付成功（仅提示用，不可作为最终依据）
    wx.showToast({ title: '支付成功' });
  },
  fail: (err) => {
    // 支付失败或取消
    wx.showToast({ title: '支付已取消', icon: 'none' });
  }
});
```

#### 第8步：用户输入密码完成支付

#### 第9步：微信回调通知后端
- 微信服务器 POST 请求到 `notify_url`
- 请求体为加密的JSON格式
- 包含签名信息在请求头

#### 第10步：后端验签并处理
```javascript
// 1. 验证签名（使用微信平台证书）
// 2. 解密数据（使用APIv3密钥）
// 3. 检查订单状态
// 4. 更新订单为已支付
// 5. 发放积分
// 6. 返回成功响应给微信
```

## 🔐 签名和加密说明

### 请求签名（SHA256-RSA）

**签名串格式：**
```
HTTP方法\n
URL路径\n
时间戳\n
随机字符串\n
请求体\n
```

**签名步骤：**
1. 按格式组装签名串
2. 使用商户私钥（`apiclient_key.pem`）
3. 使用 SHA256-RSA 算法签名
4. Base64编码

### 回调数据解密（AES-256-GCM）

**解密参数：**
- `algorithm`: 固定为 AEAD_AES_256_GCM
- `ciphertext`: 密文
- `nonce`: 随机串
- `associated_data`: 附加数据

**解密步骤：**
1. 使用 APIv3 密钥作为key
2. 使用 nonce 作为初始向量
3. 使用 associated_data 作为附加验证数据
4. AES-256-GCM 解密

## 📁 代码文件说明

### 前端文件
```
pages/recharge/index.js
  ├── processPayment()        - 发起支付（获取code）
  ├── createPaymentOrder()    - 创建订单
  └── requestWeChatPayment()  - 拉起微信支付
```

### 后端文件
```
backend-code/
  ├── routes/payment.js           - 支付路由
  │   ├── POST /create-order      - 创建订单
  │   └── POST /wechat-notify     - 支付回调
  │
  ├── utils/wechat-pay-v3.js      - 微信支付V3工具 ⭐
  │   ├── jsapiPay()              - 统一下单
  │   ├── generatePaymentParams() - 二次签名
  │   ├── handlePaymentNotify()   - 处理回调
  │   ├── verifyNotifySignature() - 验证签名
  │   └── decryptNotifyData()     - 解密数据
  │
  └── utils/wechat.js             - 微信工具
      └── code2Session()          - 获取openid
```

## 🧪 测试说明

### 开发环境测试
当未配置完整的微信支付参数时：
1. 系统自动进入模拟模式
2. 返回 `{ mock: true }` 标识
3. 前端使用模拟支付确认框
4. 调用 `/api/payment/mock-success` 完成测试

### 生产环境测试
1. 配置完整的微信支付参数
2. 使用真实的商户号和证书
3. 设置外网可访问的回调地址
4. 使用0.01元进行小额测试
5. 检查微信商户平台订单记录

## ⚠️ 重要注意事项

### 商户号配置
您提供的商户号是"瑶光小珞"，这不是有效的商户号格式。

**正确的商户号应该是：**
- 纯数字
- 10位长度
- 例如：`1234567890`

请在微信商户平台首页查看您的真实商户号。

### 证书文件
当前 `backend-code/certs/` 目录为空，请：
1. 从微信商户平台下载证书
2. 将 `apiclient_key.pem` 放入该目录
3. 确保文件权限正确（建议 600）

### APIv3密钥
当前已配置：`ajiof2135watgfsdg2315waq1g32sa1g`

如需修改，请在商户平台设置新密钥并更新 `.env` 文件。

### 回调地址
必须满足：
- ✅ HTTPS协议
- ✅ 外网可访问
- ✅ 返回200状态码
- ✅ 响应JSON格式：`{"code": "SUCCESS"}`

### 开发环境内网穿透
本地开发时，使用工具暴露本地服务：
- **ngrok**: `ngrok http 3000`
- **frp**: 自建内网穿透
- **natapp**: 国内内网穿透服务

## 🐛 常见问题

### Q1: 签名失败
**原因**：证书文件不存在或格式错误
**解决**：
1. 检查 `apiclient_key.pem` 是否存在
2. 确认证书格式正确
3. 查看后端日志

### Q2: 获取openid失败
**原因**：AppID或AppSecret配置错误
**解决**：
1. 检查 `.env` 中的配置
2. 确认小程序AppID正确
3. 查看 `code2Session` 日志

### Q3: 统一下单失败
**原因**：商户号错误或证书问题
**解决**：
1. 确认商户号是10位数字
2. 检查证书序列号
3. 查看微信返回的错误信息

### Q4: 回调验签失败
**原因**：未实现平台证书验证
**解决**：
1. 当前代码中验签返回true（开发模式）
2. 生产环境需要下载微信平台证书
3. 实现完整的签名验证逻辑

### Q5: 解密回调数据失败
**原因**：APIv3密钥错误
**解决**：
1. 确认 `WECHAT_APIV3_KEY` 配置正确
2. 密钥长度必须是32位
3. 检查解密算法参数

## 📚 参考文档

- [微信支付V3 API文档](https://pay.weixin.qq.com/wiki/doc/apiv3/index.shtml)
- [JSAPI下单API](https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_5_1.shtml)
- [支付回调通知](https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_5_5.shtml)
- [签名验证说明](https://pay.weixin.qq.com/wiki/doc/apiv3/wechatpay/wechatpay4_0.shtml)

## 📞 技术支持

如有问题，请查看：
1. 后端日志文件：`backend-code/logs/combined.log`
2. 微信商户平台订单详情
3. 小程序开发者工具Console

## ✅ 配置检查清单

部署前请确认：
- [ ] 已获取小程序AppID和AppSecret
- [ ] 已获取商户号（10位数字）
- [ ] 已设置APIv3密钥（32位）
- [ ] 已下载并放置商户证书
- [ ] 已获取证书序列号
- [ ] 已配置.env文件
- [ ] 已设置HTTPS回调地址
- [ ] 已在商户平台配置回调URL
- [ ] 已进行小额测试
- [ ] 回调接口可正常接收通知

祝您部署顺利！🎉


