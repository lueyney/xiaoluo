# 安全配置指南

## 🔒 API密钥管理最佳实践

### ✅ 正确的做法（当前实现）

#### 1. 后端存储所有密钥

所有敏感信息存储在 `backend-code/.env` 文件中：

```env
# DeepSeek API配置
DEEPSEEK_API_KEY=你的DeepSeek_API_Key
DEEPSEEK_API_BASE=https://api.deepseek.com/v1

# PaperFake API配置
PAPERFAKE_USERNAME=18166973213
PAPERFAKE_PASSWORD=a121712123
PAPERFAKE_API_BASE=https://paperfake.cn/pcserver

# LangGraph.js 写作编排
DEEPSEEK_PLANNING_MODEL=deepseek-chat
DEEPSEEK_DRAFTING_MODEL=deepseek-chat
```

#### 2. 前端只调用后端接口

前端代码中**完全不包含**任何密钥信息：

```javascript
// ✅ 正确：前端只调用后端
wx.request({
  url: `${apiBaseUrl}/api/rewrite/process`,
  method: "POST",
  header: {
    "Authorization": `Bearer ${userToken}`  // 用户token，不是API密钥
  },
  data: {
    originalText: text,
    rewriteLevel: level,
    platform: platform  // 只传业务参数
  }
});
```

#### 3. 后端代理所有第三方API

后端从环境变量读取密钥，代理调用第三方API：

```javascript
// backend-code/routes/rewrite.js
const PAPERFAKE_CONFIG = {
  username: process.env.PAPERFAKE_USERNAME,  // ✅ 从环境变量读取
  password: process.env.PAPERFAKE_PASSWORD,
  baseURL: process.env.PAPERFAKE_API_BASE
};

// 后端调用PaperFake API
const apiResponse = await axios.post(
  `${PAPERFAKE_CONFIG.baseURL}/sa/saReduceAIGCTextV2`,
  {
    text: originalText,
    sa_username: PAPERFAKE_CONFIG.username,  // ✅ 使用后端密钥
    sa_password: PAPERFAKE_CONFIG.password
  }
);
```

---

### ❌ 错误的做法（已避免）

#### 1. 在前端硬编码密钥

```javascript
// ❌ 错误：密钥暴露在前端
const API_KEY = "your_secret_key_123456";
const USERNAME = "18166973213";
const PASSWORD = "a121712123";

wx.request({
  url: "https://paperfake.cn/pcserver/sa/saReduceAIGCTextV2",
  data: {
    sa_username: USERNAME,  // ❌ 密钥暴露
    sa_password: PASSWORD   // ❌ 密钥暴露
  }
});
```

**问题：**
- 所有用户都能看到源代码
- 密钥可以被提取
- 第三方可以盗用账号
- 无法控制API调用

#### 2. 在前端配置文件中存储

```javascript
// ❌ 错误：config.js
export const API_CONFIG = {
  paperfake: {
    username: "18166973213",
    password: "a121712123"
  }
};
```

**问题：**
- 打包后密钥仍然可见
- 无法动态更换密钥
- 存在安全风险

---

## 🏗️ 当前系统架构

### 请求流程

```
┌─────────────────┐
│   小程序前端     │
│                 │
│ - 只传业务参数  │
│ - 不含API密钥   │
└────────┬────────┘
         │ HTTP POST
         │ /api/rewrite/process
         ↓
┌─────────────────┐
│  Node.js后端    │
│                 │
│ - 从.env读密钥  │
│ - 代理API调用   │
│ - 记录日志      │
│ - 管理订单      │
└────────┬────────┘
         │ HTTPS POST
         │ 使用后端密钥
         ↓
┌─────────────────┐
│  PaperFake API  │
│                 │
│ - 验证账号密码  │
│ - 执行降重      │
│ - 返回结果      │
└─────────────────┘
```

### 安全层级

1. **用户层**：JWT Token认证
2. **应用层**：后端验证用户权限
3. **API层**：后端使用环境变量中的密钥
4. **传输层**：HTTPS加密

---

## 🛡️ 安全措施

### 已实现

- ✅ JWT身份认证
- ✅ 环境变量存储密钥
- ✅ 请求频率限制（15分钟100次）
- ✅ 详细的操作日志
- ✅ 积分交易审计
- ✅ 后端代理模式

### 生产环境建议

#### 1. .env文件保护

```bash
# .gitignore中添加
.env
.env.*
!.env.example
```

#### 2. 环境变量验证

```javascript
// 启动时验证必需的环境变量
const requiredEnvVars = [
  'PAPERFAKE_USERNAME',
  'PAPERFAKE_PASSWORD',
  'JWT_SECRET'
];

for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    throw new Error(`缺少必需的环境变量: ${varName}`);
  }
}
```

#### 3. 密钥轮换

- 定期更换API密钥
- 支持多密钥配置（主备切换）
- 记录密钥使用情况

#### 4. 访问控制

- IP白名单
- 用户级别的访问限制
- 敏感操作需要二次验证

---

## 📋 配置清单

### 开发环境（当前）

```env
# PaperFake API
PAPERFAKE_USERNAME=18166973213
PAPERFAKE_PASSWORD=a121712123

# DeepSeek API
DEEPSEEK_API_KEY=你的DeepSeek_API_Key
DEEPSEEK_API_BASE=https://api.deepseek.com/v1
```

### 生产环境

```env
# 使用生产账号
PAPERFAKE_USERNAME=生产账号
PAPERFAKE_PASSWORD=生产密码

# 启用HTTPS
NODE_ENV=production
SSL_KEY=/path/to/ssl.key
SSL_CERT=/path/to/ssl.cert

# 数据库加密连接
DB_SSL=true
```

---

## 🎯 总结

当前实现完全符合安全最佳实践：

✅ **前端安全**：不含任何密钥
✅ **后端安全**：环境变量存储密钥
✅ **传输安全**：JWT + HTTPS
✅ **审计安全**：完整日志记录

**密钥不会暴露给用户，系统架构安全可靠！**



