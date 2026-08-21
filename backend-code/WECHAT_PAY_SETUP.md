# 微信支付配置指南

## 概述

本系统已经集成了微信支付功能，支持小程序内充值积分。以下是配置和使用微信支付的详细说明。

## 前置条件

1. 已注册微信小程序账号
2. 已开通微信支付商户号
3. 小程序已关联微信支付商户号

## 配置步骤

### 1. 获取微信支付参数

登录微信商户平台（https://pay.weixin.qq.com），获取以下参数：

- **AppID**: 小程序AppID（在小程序后台获取）
- **商户号（MchId）**: 微信支付商户号
- **API密钥（API Key）**: 在商户平台设置 API密钥

### 2. 配置环境变量

在 `backend-code/.env` 文件中添加以下配置：

```env
# 微信支付配置
WECHAT_APP_ID=你的小程序AppID
WECHAT_MCH_ID=你的商户号
WECHAT_APIV3_KEY=你的32字节APIv3密钥
WECHAT_CERT_SERIAL=你的商户证书序列号
WECHAT_NOTIFY_URL=https://你的域名/api/wechat-pay/notify
WECHAT_PRIVATE_KEY_BASE64=商户API私钥的Base64内容
```

**重要提示**：
- `WECHAT_NOTIFY_URL` 必须是外网可访问的HTTPS地址
- 开发环境可以使用内网穿透工具（如 ngrok）暴露本地服务

### 3. 配置支付目录

在微信小程序后台 -> 开发 -> 开发管理 -> 开发设置 -> 支付配置中：

1. 设置支付域名：添加你的服务器域名
2. 设置业务域名：添加你的服务器域名

### 4. 配置支付回调

在微信商户平台 -> 产品中心 -> 开发配置 -> 支付配置中：

1. 设置支付回调URL: `https://你的域名/api/payment/wechat-notify`
2. 确保该URL可以被微信服务器访问

## 测试说明

### 开发环境测试

在未配置微信支付参数的情况下，系统会使用**模拟支付**功能：

1. 用户点击充值时，前端会检测是否有支付参数
2. 如果没有支付参数（`payParams` 为 null），会弹出模拟支付确认框
3. 用户确认后，调用 `/api/payment/mock-success` 接口完成支付

### 生产环境

在生产环境中配置好微信支付参数后：

1. 创建订单接口会调用微信统一下单接口
2. 返回微信支付参数给前端
3. 前端调用 `wx.requestPayment()` 拉起微信支付
4. 支付完成后，微信服务器会回调 `/api/payment/wechat-notify`
5. 系统处理回调，更新订单状态并发放积分

## API接口说明

### 1. 检查首充状态

```
GET /api/payment/check-first-recharge
```

**响应示例**：
```json
{
  "code": "SUCCESS",
  "data": {
    "hasFirstRecharge": false
  }
}
```

### 2. 创建充值订单

```
POST /api/payment/create-order
```

**请求参数**：
```json
{
  "packageId": 1,
  "amount": 1.00,
  "credits": 50,
  "isFirstTime": true
}
```

**响应示例**：
```json
{
  "code": "SUCCESS",
  "message": "订单创建成功",
  "data": {
    "orderId": 123,
    "amount": 1.00,
    "credits": 50,
    "payParams": {
      "appId": "wxXXXXXX",
      "timeStamp": "1234567890",
      "nonceStr": "randomstring",
      "package": "prepay_id=xxx",
      "signType": "MD5",
      "paySign": "SIGNATURE"
    }
  }
}
```

### 3. 模拟支付成功（仅开发环境）

```
POST /api/payment/mock-success
```

**请求参数**：
```json
{
  "orderId": 123
}
```

### 4. 微信支付回调（微信服务器调用）

```
POST /api/payment/wechat-notify
```

## 充值套餐说明

系统支持以下充值套餐：

| 套餐ID | 金额 | 积分 | 说明 |
|--------|------|------|------|
| 0 | ¥1 | 50 | 首充特惠（仅限首次充值） |
| 1 | ¥1 | 1 | 体验套餐 |
| 2 | ¥10 | 10 | 基础套餐 |
| 3 | ¥20 | 20 | 标准套餐 |
| 4 | ¥50 | 50 | 热门套餐（推荐） |
| 5 | ¥100 | 100 | 豪华套餐 |

**首充特惠规则**：
- 每个用户仅可使用一次
- 充值1元获得50积分（赠送49积分）
- 使用后自动从充值列表中隐藏

## 安全注意事项

1. **保护API密钥**：不要将API密钥提交到代码仓库
2. **验证签名**：系统会自动验证微信支付回调的签名
3. **防止重复处理**：系统会检查订单状态，防止重复发放积分
4. **使用HTTPS**：生产环境必须使用HTTPS协议
5. **IP白名单**：在微信商户平台设置IP白名单

## 常见问题

### Q1: 支付时提示"调用支付失败"

**解决方法**：
1. 检查小程序AppID是否正确
2. 检查商户号是否正确
3. 检查是否已在微信小程序后台配置支付域名

### Q2: 支付成功但积分未到账

**解决方法**：
1. 查看后端日志，检查是否收到微信支付回调
2. 确认回调URL是否正确配置
3. 检查服务器防火墙是否允许微信服务器访问

### Q3: 模拟支付在生产环境仍然可用

**解决方法**：
1. 确认环境变量已正确配置
2. 重启后端服务使配置生效
3. 生产环境应禁用 `/api/payment/mock-success` 接口

## 联系支持

如有问题，请查看：
- 微信支付官方文档: https://pay.weixin.qq.com/wiki/doc/api/index.html
- 小程序支付接入指南: https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/payment.html


