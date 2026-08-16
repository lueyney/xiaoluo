# 🧪 API 接口测试指南

## ✅ 服务器状态

- **状态**: 运行中
- **本地地址**: http://127.0.0.1:3000
- **局域网地址**: http://172.20.10.8:3000
- **环境**: development

---

## 📡 核心功能测试

### 1️⃣ 论文生成功能测试

#### 接口信息
- **路径**: `POST /api/writing/generate`
- **需要认证**: ✅ 是
- **功能**: 使用 DeepSeek + LangGraph.js 生成论文文档

#### 测试步骤

1. **先注册/登录获取Token**
```bash
# 注册新用户
curl -X POST http://127.0.0.1:3000/api/auth/send-code \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","scene":"register"}'

# 查看控制台日志获取验证码，然后注册
curl -X POST http://127.0.0.1:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "phone":"13800138000",
    "password":"Pass@123",
    "code":"验证码",
    "inviteCode":""
  }'

# 保存返回的 token
```

2. **生成开题报告（20积分）**
```bash
curl -X POST http://127.0.0.1:3000/api/writing/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "topic": "人工智能在教育领域的应用研究",
    "field": "教育学",
    "contentTypes": ["开题报告"]
  }'
```

3. **生成任务书（15积分）**
```bash
curl -X POST http://127.0.0.1:3000/api/writing/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "topic": "大数据背景下的个性化学习研究",
    "field": "计算机科学",
    "contentTypes": ["任务书"]
  }'
```

4. **生成学术论文（60积分）**
```bash
curl -X POST http://127.0.0.1:3000/api/writing/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "topic": "基于深度学习的图像识别技术研究",
    "field": "人工智能",
    "contentTypes": ["学术论文"]
  }'
```

#### 预期响应
```json
{
  "code": "SUCCESS",
  "message": "文档生成成功",
  "data": {
    "documents": [
      {
        "id": 1,
        "type": "开题报告",
        "title": "人工智能在教育领域的应用研究",
        "content": "...",
        "credits_cost": 20
      }
    ],
    "totalCost": 20,
    "remainingCredits": 0
  }
}
```

#### ⚠️ 注意事项
- 新用户初始积分为 **0**（已更新）
- 需要先充值才能生成文档
- 不同文档类型消耗的积分不同：
  - 学术论文：60积分
  - 文献综述：35积分
  - 答辩PPT：25积分
  - 开题报告：20积分
  - 任务书：15积分
  - 中期检查表：10积分
  - 答辩稿：5积分

---

### 2️⃣ 支付功能测试

#### 接口信息
- **路径**: `POST /api/wechat-pay/create-order`
- **需要认证**: ✅ 是
- **功能**: 创建充值订单

#### 充值套餐列表

| ID | 价格 | 积分 | 说明 |
|----|------|------|------|
| 1 | ¥1 | 50积分 | 首充特惠（赠送49积分） |
| 2 | ¥10 | 10积分 | 基础套餐 |
| 3 | ¥20 | 20积分 | 标准套餐 |
| 4 | ¥50 | 50积分 | 热门套餐 ⭐ |
| 5 | ¥100 | 100积分 | 超值套餐 |

#### 测试步骤

1. **创建1元首充订单**
```bash
curl -X POST http://127.0.0.1:3000/api/wechat-pay/create-order \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "packageId": 1
  }'
```

2. **创建50元充值订单**
```bash
curl -X POST http://127.0.0.1:3000/api/wechat-pay/create-order \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "packageId": 4
  }'
```

#### 预期响应
```json
{
  "code": "SUCCESS",
  "message": "订单创建成功",
  "data": {
    "orderId": 1,
    "outTradeNo": "ORDER1730390123000001",
    "amount": 1.00,
    "credits": 50,
    "payParams": {
      "timeStamp": "1730390123",
      "nonceStr": "abc123...",
      "package": "prepay_id=wx...",
      "signType": "RSA",
      "paySign": "..."
    }
  }
}
```

3. **查询订单状态**
```bash
curl -X GET "http://127.0.0.1:3000/api/wechat-pay/check-status/1" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

4. **查询订单列表**
```bash
curl -X GET "http://127.0.0.1:3000/api/wechat-pay/orders?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 3️⃣ 其他功能测试

#### 查看文档列表
```bash
curl -X GET "http://127.0.0.1:3000/api/documents?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### 查看用户信息
```bash
curl -X GET http://127.0.0.1:3000/api/user/profile \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### 查看积分信息
```bash
curl -X GET http://127.0.0.1:3000/api/user/credits \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### AI降重
```bash
curl -X POST http://127.0.0.1:3000/api/rewrite \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "text": "人工智能是计算机科学的一个分支，它试图理解智能的实质，并生产出一种新的能以人类智能相似的方式做出反应的智能机器。",
    "level": "中等降重"
  }'
```

#### AI题目生成
```bash
curl -X POST http://127.0.0.1:3000/api/title-generator/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "field": "教育学",
    "keywords": "在线学习,教育技术,学习效果",
    "count": 5
  }'
```

---

## 🔍 完整测试流程

### 场景1：新用户注册并生成第一篇论文

```bash
# 1. 发送验证码
curl -X POST http://127.0.0.1:3000/api/auth/send-code \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900139000","scene":"register"}'

# 2. 注册（从控制台获取验证码）
curl -X POST http://127.0.0.1:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "phone":"13900139000",
    "password":"Test@123",
    "code":"123456"
  }'
# 响应会包含 token，记下来

# 3. 查看初始积分（应该是0）
curl -X GET http://127.0.0.1:3000/api/user/credits \
  -H "Authorization: Bearer YOUR_TOKEN"

# 4. 创建首充订单（1元=50积分）
curl -X POST http://127.0.0.1:3000/api/wechat-pay/create-order \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"packageId": 1}'

# 5. 支付完成后，生成开题报告（消耗20积分）
curl -X POST http://127.0.0.1:3000/api/writing/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "topic": "移动学习在高等教育中的应用研究",
    "field": "教育学",
    "contentTypes": ["开题报告"]
  }'

# 6. 查看剩余积分（应该是30）
curl -X GET http://127.0.0.1:3000/api/user/credits \
  -H "Authorization: Bearer YOUR_TOKEN"

# 7. 查看生成的文档
curl -X GET http://127.0.0.1:3000/api/documents \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## ⚠️ 测试注意事项

### 环境配置检查
✅ 所有配置项已验证：
- DB_HOST: localhost
- DB_NAME: lunjun_app
- WECHAT_APP_ID: 已配置
- WECHAT_APP_SECRET: 已配置
- DEEPSEEK_API_KEY: 已配置
- WECHAT_MCH_ID: 已配置
- JWT_SECRET: 已配置

### 常见问题

1. **积分不足**
   - 新用户初始积分为0
   - 需要先充值才能生成文档

2. **Token过期**
   - Token有效期7天
   - 过期后需要重新登录

3. **验证码问题**
   - 验证码在后端控制台输出
   - 有效期5分钟

4. **支付测试**
   - 支付功能需要真实的微信支付环境
   - 测试环境可以使用沙箱环境

---

## 📊 API完整列表

### 认证相关 (/api/auth)
- POST /send-code - 发送验证码
- POST /register - 用户注册
- POST /login - 用户登录
- POST /phone-one-click-login - 本机号码一键登录
- POST /wechat-phone-login - 微信手机号登录

### 用户管理 (/api/user)
- GET /profile - 获取用户信息
- PUT /profile - 更新用户信息
- GET /credits - 获取积分信息
- GET /invite-code - 获取邀请码

### AI论文生成 (/api/writing) ⭐
- POST /generate - 生成论文文档
- GET /available-types - 获取可用文档类型
- GET /workflows - 获取工作流配置

### 支付功能 (/api/wechat-pay) ⭐
- POST /create-order - 创建支付订单
- POST /notify - 微信支付回调
- GET /check-status/:orderId - 查询订单状态
- POST /close-order/:orderId - 关闭订单
- GET /orders - 查询订单列表

### 文档管理 (/api/documents)
- GET / - 获取文档列表
- GET /:id - 获取文档详情
- DELETE /:id - 删除文档
- PUT /:id/mark-read - 标记文档已读

### AI降重 (/api/rewrite)
- POST / - AI降重接口
- GET /history - 获取降重历史

### AI题目生成 (/api/title-generator)
- POST /generate - 生成论文题目

### 订单管理 (/api/orders)
- GET / - 获取订单列表
- GET /:id - 获取订单详情

### 幸运转盘 (/api/wheel)
- POST /spin - 开始抽奖
- GET /records - 获取抽奖记录

### 通知系统 (/api/notifications)
- GET / - 获取通知列表
- PUT /:id/read - 标记通知已读

---

## 🎯 测试结果

- ✅ 服务器启动成功
- ✅ 数据库连接正常
- ✅ 所有路由配置正确
- ✅ 环境变量配置完整
- ✅ 微信支付证书加载成功
- ✅ 前后端分离架构正确

**准备就绪，可以开始测试！** 🚀


