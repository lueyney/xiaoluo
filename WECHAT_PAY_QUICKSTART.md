# 微信支付快速开始 🚀

## 📦 已完成的功能

✅ 完整的微信支付 V3 API 集成  
✅ JSAPI 下单（统一下单）  
✅ 二次签名生成支付参数  
✅ 支付回调处理（验签、解密）  
✅ 自动发放积分  
✅ 首充优惠控制  
✅ 开发环境模拟支付  

## 🎯 支付流程

```
用户点击充值 → 获取code → 创建订单 → 统一下单 → 拉起支付 
         ↓
    支付成功 ← 发放积分 ← 处理回调 ← 微信通知
```

## ⚡ 快速配置（3步）

### 1️⃣ 配置环境变量

编辑 `backend-code/.env`：

```env
# 微信小程序
WECHAT_APP_ID=你的小程序AppID
WECHAT_APP_SECRET=你的AppSecret

# 微信支付V3
WECHAT_MCH_ID=你的商户号(10位数字)
WECHAT_APIV3_KEY=ajiof2135watgfsdg2315waq1g32sa1g
WECHAT_CERT_SERIAL=你的证书序列号
WECHAT_NOTIFY_URL=https://你的域名/api/payment/wechat-notify
```

### 2️⃣ 放置证书文件

将商户私钥放到：
```
backend-code/certs/apiclient_key.pem
```

### 3️⃣ 启动服务

```bash
cd backend-code
npm install
npm start
```

## 🧪 测试

### 开发环境（模拟支付）
未配置完整参数时自动启用，无需真实支付。

### 生产环境（真实支付）
1. 完成上述配置
2. 设置外网HTTPS回调地址
3. 使用1元套餐测试
4. 检查积分到账

## ⚠️ 重要提醒

### 🔴 商户号格式
您提供的"瑶光小珞"不是有效的商户号！

**正确格式：**
- 纯数字，10位长度
- 示例：`1234567890`
- 位置：微信商户平台首页

### 🔴 证书文件
当前 `backend-code/certs/` 为空，需要：
1. 登录微信商户平台
2. 下载商户API证书
3. 放置 `apiclient_key.pem`

### 🔴 回调地址
必须是 HTTPS 外网可访问地址！

**本地开发：**
```bash
# 使用 ngrok
ngrok http 3000

# 将生成的 https 地址配置到 WECHAT_NOTIFY_URL
```

## 📁 核心文件

```
前端：
  pages/recharge/index.js - 充值页面（已集成）

后端：
  routes/payment.js - 支付路由
  utils/wechat-pay-v3.js - 微信支付V3工具⭐
  utils/wechat.js - 获取openid
```

## 🐛 常见问题

**Q: 获取openid失败？**  
A: 检查 `WECHAT_APP_ID` 和 `WECHAT_APP_SECRET`

**Q: 统一下单失败？**  
A: 确认商户号是10位数字，证书文件存在

**Q: 收不到回调？**  
A: 确认回调地址外网可访问（HTTPS）

**Q: 解密失败？**  
A: 检查 `WECHAT_APIV3_KEY` 是否正确（32位）

## 📚 详细文档

- [完整配置指南](backend-code/WECHAT_PAY_V3_CONFIG.md)
- [集成总结](WECHAT_PAY_INTEGRATION_SUMMARY.md)
- [微信支付官方文档](https://pay.weixin.qq.com/wiki/doc/apiv3/index.shtml)

## ✅ 部署清单

部署前确认：

- [ ] 商户号（10位数字）
- [ ] 证书文件已放置
- [ ] .env 配置完整
- [ ] 回调地址可访问
- [ ] 已小额测试

## 🎉 开始使用

配置完成后，用户在充值页面选择套餐即可自动：
1. 获取code
2. 创建订单
3. 拉起微信支付
4. 自动到账积分

全程无需手动干预！

---

**技术支持：** 查看后端日志 `backend-code/logs/combined.log`

