# 🚀 微信支付快速开始（3步完成）

## 📋 已完成的工作

✅ 创建支付闭环API路由 `/api/wechat-pay/*`  
✅ 前端调用新路由  
✅ 配置商户号 `1730723347`  
✅ 配置 APIv3 密钥  
✅ 完整的日志系统  
✅ 开发环境模拟支付  

## ⚡ 三步完成配置

### 1️⃣ 配置环境变量

```bash
# 复制配置模板
cp backend-code/.env.payment backend-code/.env

# 编辑 .env 文件，填写以下必需项：
```

```env
# 小程序配置（必填⭐）
WECHAT_APP_ID=你的小程序AppID
WECHAT_APP_SECRET=你的小程序AppSecret

# 证书序列号（必填⭐）
WECHAT_CERT_SERIAL=你的证书序列号

# 回调地址（必填⭐）
WECHAT_NOTIFY_URL=https://你的域名/api/wechat-pay/notify
```

**已经配置好的：**
- ✅ 商户号：`1730723347`
- ✅ APIv3密钥：`ajiof2135watgfsdg2315waq1g32sa1g`

### 2️⃣ 放置证书文件

```bash
# 将证书文件放到：
backend-code/certs/apiclient_key.pem
```

**获取证书：**
1. 登录 https://pay.weixin.qq.com
2. 账户中心 → API安全 → API证书
3. 下载证书压缩包
4. 解压并复制 `apiclient_key.pem`

**获取证书序列号：**
```bash
openssl x509 -in apiclient_cert.pem -noout -serial
```

### 3️⃣ 启动服务

```bash
cd backend-code
npm install
npm start
```

**启动成功标志：**
```
✅ 服务器运行在端口 3000
✅ 微信支付配置已加载
```

## 🎯 新的API路由

所有支付相关请求使用新路由：

```
POST   /api/wechat-pay/create-order           - 创建订单
POST   /api/wechat-pay/notify                 - 支付回调
GET    /api/wechat-pay/order/:id              - 查询订单
GET    /api/wechat-pay/orders                 - 订单列表
GET    /api/wechat-pay/check-first-recharge   - 检查首充
POST   /api/wechat-pay/mock-success           - 模拟支付
```

## 🧪 测试

### 开发环境（模拟支付）
未配置证书时自动启用，无需真实支付。

### 生产环境（真实支付）
1. 完成上述3步配置
2. 选择1元充值套餐测试
3. 查看日志确认流程

## 📊 支付流程

```
用户点击充值
    ↓
获取code（wx.login）
    ↓
创建订单（POST /api/wechat-pay/create-order）
    ↓
后端：code换openid → 统一下单 → 二次签名
    ↓
返回支付参数
    ↓
拉起支付（wx.requestPayment）
    ↓
用户输入密码
    ↓
微信回调（POST /api/wechat-pay/notify）
    ↓
验签→解密→发放积分
    ↓
完成 ✅
```

## 📝 日志示例

### 创建订单
```
========================================
🛒 开始创建充值订单
========================================
📝 订单信息: 用户1, 金额¥1, 积分50
🔑 步骤3: 获取用户openid...
✅ openid获取成功
💾 创建订单记录...
✅ 订单创建成功: ID=123
💳 步骤4: 调用微信支付统一下单
✅ 获得prepay_id
🔐 步骤5: 生成支付参数（二次签名）
✅ 支付参数生成成功
🎉 订单创建流程完成！
```

### 支付回调
```
========================================
📥 收到微信支付V3回调通知
========================================
✅ 回调验证成功
   订单号: 123
   微信订单号: 4200001234567890
🔄 开始处理订单...
   ✓ 订单状态已更新为已支付
   ✓ 用户积分已增加 50
   ✓ 积分流水已记录
🎉 支付处理成功！
```

## ⚠️ 重要提醒

### ✅ 商户号
已配置为：`1730723347`

### ✅ APIv3密钥
已配置为：`ajiof2135watgfsdg2315waq1g32sa1g`

### ❗ 需要您配置
1. **小程序AppID和AppSecret**（在小程序后台获取）
2. **证书文件** `apiclient_key.pem`（从商户平台下载）
3. **证书序列号**（查看证书或使用命令获取）
4. **回调地址**（HTTPS外网可访问）

### 🔐 回调地址配置

**开发环境（使用ngrok）：**
```bash
# 安装 ngrok
npm install -g ngrok

# 启动内网穿透
ngrok http 3000

# 复制生成的 https 地址
https://abc123.ngrok.io

# 配置到 .env
WECHAT_NOTIFY_URL=https://abc123.ngrok.io/api/wechat-pay/notify
```

**生产环境：**
```env
WECHAT_NOTIFY_URL=https://你的域名/api/wechat-pay/notify
```

## 📚 详细文档

- [完整支付闭环文档](PAYMENT_CLOSURE_COMPLETE.md)
- [证书文件说明](backend-code/certs/README.md)
- [API路由代码](backend-code/routes/wechat-pay.js)

## 🐛 问题排查

### Q: 获取openid失败？
**A:** 检查 `WECHAT_APP_ID` 和 `WECHAT_APP_SECRET`

### Q: 统一下单失败？
**A:** 确认证书文件存在且格式正确

### Q: 收不到回调？
**A:** 确认回调地址外网可访问（HTTPS）

### Q: 签名失败？
**A:** 检查证书序列号是否正确

## ✅ 验收清单

- [ ] 已配置小程序AppID和AppSecret
- [ ] 已放置证书文件
- [ ] 已配置证书序列号
- [ ] 已设置回调地址
- [ ] 已启动服务
- [ ] 已进行测试充值

## 🎉 开始使用

配置完成后，用户在充值页面选择套餐即可：
1. 自动获取code
2. 创建订单
3. 拉起支付
4. 自动到账

**全程自动化，无需手动干预！** 🚀

---

**技术支持：**
- 查看日志：`backend-code/logs/combined.log`
- 微信支付客服：95017
- 商户平台：https://pay.weixin.qq.com

