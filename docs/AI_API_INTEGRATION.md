# AI API 接入指南

## 🎯 概述

本系统已完全准备好接入真实的AI API。支持多种主流AI服务提供商，可以轻松切换。

---

## 🔧 已完成的准备工作

### 1. **AI服务架构** ✅

```
前端页面
  ↓
POST /api/ai/writing (AI创作)
POST /api/ai/rewrite (AI降重)
  ↓
后端AI路由
  ↓
AI服务调用层 (utils/ai-service.js)
  ↓
真实AI API (OpenAI/通义千问/文心一言等)
  ↓
返回生成内容
  ↓
自动保存到文档库
  ↓
扣减积分
  ↓
发送通知
```

### 2. **支持的AI提供商** ✅

| 提供商 | 状态 | 配置项 |
|--------|------|--------|
| **OpenAI / GPT** | ✅ 已实现 | OPENAI_API_KEY |
| **阿里云通义千问** | ✅ 已实现 | QWEN_API_KEY |
| **百度文心一言** | ✅ 已实现 | WENXIN_API_KEY + SECRET |
| **腾讯混元** | 🔄 预留接口 | HUNYUAN_SECRET_ID + KEY |
| **讯飞星火** | 🔄 预留接口 | SPARK_APP_ID + API_KEY |

### 3. **核心文件** ✅

| 文件 | 功能 |
|-----|------|
| `backend-code/config/ai-api.js` | AI API配置管理 |
| `backend-code/utils/ai-service.js` | AI服务调用工具 |
| `backend-code/routes/ai.js` | AI路由（已集成） |
| `backend-code/.env.ai-example` | AI配置示例 |

---

## 📝 配置步骤

### 步骤1：选择AI提供商

#### 选项A：OpenAI / GPT（推荐）

```bash
# 在 .env 文件中添加
ENABLE_REAL_AI_API=true
OPENAI_API_KEY=sk-your-openai-api-key-here
OPENAI_MODEL=gpt-3.5-turbo
OPENAI_API_BASE=https://api.openai.com/v1
```

#### 选项B：阿里云通义千问

```bash
# 在 .env 文件中添加
ENABLE_REAL_AI_API=true
QWEN_API_KEY=your-qwen-api-key-here
QWEN_MODEL=qwen-turbo
```

#### 选项C：百度文心一言

```bash
# 在 .env 文件中添加
ENABLE_REAL_AI_API=true
WENXIN_API_KEY=your-api-key
WENXIN_SECRET_KEY=your-secret-key
```

### 步骤2：配置AI参数

```bash
# 通用AI配置
AI_API_TIMEOUT=60000        # 超时时间（毫秒）
AI_MAX_TOKENS=4000          # 最大token数
AI_TEMPERATURE=0.7          # 生成温度（0-1）
AI_MAX_RETRIES=3            # 最大重试次数
AI_RETRY_DELAY=1000         # 重试延迟（毫秒）
AI_MOCK_DELAY=3000          # 模拟模式延迟（毫秒）
```

### 步骤3：重启服务器

```powershell
cd backend-code
# 停止旧进程
Stop-Process -Name node -Force

# 启动服务器
node app.js
```

---

## 🔄 API调用流程

### AI创作流程

```
1. 前端提交创作请求
   POST /api/ai/writing
   {
     field: "计算机科学",
     topic: "深度学习算法研究",
     contentTypes: ["学术论文", "开题报告"],
     requirements: "需要包含最新研究进展"
   }
   ↓
2. 后端验证参数和积分
   ↓
3. 创建任务记录 (ai_writing_tasks表)
   ↓
4. 立即返回任务ID
   {
     code: "SUCCESS",
     data: {
       taskId: 123,
       estimatedTime: 30,
       creditsCost: 60
     }
   }
   ↓
5. 后台异步调用AI API
   - 调用 generateWriting()
   - 生成文本内容
   ↓
6. 生成完成后：
   - 扣减积分
   - 保存文档（多个类型分别保存）
   - 记录积分交易
   - 发送完成通知
   ↓
7. 前端轮询任务状态
   GET /api/ai/task/123
   ↓
8. 获取结果并刷新文档库
```

### AI降重流程

```
1. 前端提交降重请求
   POST /api/ai/rewrite
   {
     originalText: "原始文本...",
     rewriteLevel: 2,  // 1-3
     discipline: "计算机科学"
   }
   ↓
2. 后端计算积分并验证
   ↓
3. 创建任务记录 (ai_rewrite_tasks表)
   ↓
4. 立即返回任务ID
   ↓
5. 后台异步调用AI降重API
   - 调用 generateRewrite()
   - 生成降重文本
   ↓
6. 完成后：
   - 扣减积分
   - 保存降重文档
   - 记录交易
   - 发送通知
   ↓
7. 前端获取结果
```

---

## 📊 数据库表结构

### AI创作任务表

```sql
CREATE TABLE ai_writing_tasks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  field VARCHAR(50),                 -- 学科领域
  topic VARCHAR(255) NOT NULL,       -- 题目
  content_types JSON,                -- 生成类型数组
  requirements TEXT,                 -- 详细要求
  title_level1 VARCHAR(50),          -- 标题格式
  title_level2 VARCHAR(50),
  credits_cost INT NOT NULL,         -- 消耗积分
  status ENUM('processing', 'completed', 'failed') DEFAULT 'processing',
  result_content LONGTEXT,           -- 生成结果
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_status (status)
);
```

### AI降重任务表

```sql
CREATE TABLE ai_rewrite_tasks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  original_text LONGTEXT NOT NULL,   -- 原始文本
  rewritten_text LONGTEXT,           -- 降重后文本
  rewrite_level INT NOT NULL,        -- 降重等级 1-3
  discipline VARCHAR(50),            -- 学科
  language VARCHAR(20),              -- 语言
  platform VARCHAR(50),              -- 检测平台
  similarity INT,                    -- 相似度
  credits_cost INT NOT NULL,
  status ENUM('processing', 'completed', 'failed') DEFAULT 'processing',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_status (status)
);
```

---

## 🛠️ AI服务工具 (`utils/ai-service.js`)

### 核心函数

#### 1. `generateWriting(params)`
```javascript
// AI创作
const content = await generateWriting({
  field: "计算机科学",
  topic: "深度学习研究",
  contentTypes: ["学术论文", "开题报告"],
  requirements: "需要包含最新进展"
});
```

#### 2. `generateRewrite(params)`
```javascript
// AI降重
const rewrittenText = await generateRewrite({
  text: "原始文本...",
  level: 2,  // 1=轻度, 2=中度, 3=深度
  discipline: "计算机科学",
  language: "中文"
});
```

#### 3. `callAIAPIWithRetry(params)`
```javascript
// 带重试的API调用
const response = await callAIAPIWithRetry({
  prompt: "生成内容...",
  systemPrompt: "你是专业助手",
  maxTokens: 4000
});
```

---

## 🎯 多文档生成

### 后端实现（已完成）

```javascript
// 保存文档（支持多文档）
if (contentTypes.length > 1) {
  // 多个类型，分别保存每个文档
  const costPerDoc = Math.ceil(creditsCost / contentTypes.length);
  
  for (const type of contentTypes) {
    await connection.execute(
      `INSERT INTO documents (user_id, title, content, type, field, word_count, credits_cost)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, `${topic} - ${type}`, content, type, field, content.length, costPerDoc]
    );
  }
} else {
  // 单个类型，保存一个文档
  await connection.execute(...);
}
```

### 效果

```
用户选择: 学术论文 + 开题报告 + 任务书
主题: "人工智能研究"

生成后文档库显示:
  ✅ 人工智能研究 - 学术论文 [学术论文]
  ✅ 人工智能研究 - 开题报告 [开题报告]
  ✅ 人工智能研究 - 任务书 [任务书]

每个文档:
  - 独立的标题
  - 独立的类型标签
  - 可以单独查看、删除
  - 积分平均分配
```

---

## 📡 API接口文档

### 1. AI创作接口

```
POST /api/ai/writing
Authorization: Bearer {token}

请求体:
{
  "field": "计算机科学",
  "topic": "深度学习算法研究",
  "contentTypes": ["学术论文", "开题报告", "任务书"],
  "requirements": "需要包含最新研究进展",
  "titleLevel1": "一、中文数字",
  "titleLevel2": "(一) 中文序号"
}

响应:
{
  "code": "SUCCESS",
  "message": "AI创作任务已提交",
  "data": {
    "taskId": 123,
    "estimatedTime": 30,
    "creditsCost": 75
  }
}
```

### 2. AI降重接口

```
POST /api/ai/rewrite
Authorization: Bearer {token}

请求体:
{
  "originalText": "需要降重的文本内容...",
  "rewriteLevel": 2,
  "discipline": "计算机科学",
  "language": "中文",
  "platform": "知网"
}

响应:
{
  "code": "SUCCESS",
  "message": "AI降重任务已提交",
  "data": {
    "taskId": 456,
    "estimatedTime": 20,
    "creditsCost": 50
  }
}
```

### 3. 查询任务状态

```
GET /api/ai/task/:id
Authorization: Bearer {token}

响应（处理中）:
{
  "code": "SUCCESS",
  "data": {
    "id": 123,
    "task_type": "writing",
    "status": "processing",
    "topic": "深度学习算法研究",
    "content_types": ["学术论文", "开题报告"],
    ...
  }
}

响应（已完成）:
{
  "code": "SUCCESS",
  "data": {
    "id": 123,
    "task_type": "writing",
    "status": "completed",
    "result_content": "生成的完整内容...",
    ...
  }
}
```

---

## 🚀 快速开始

### 开发模式（使用模拟）

```bash
# .env 文件配置
ENABLE_REAL_AI_API=false

# 启动服务器
cd backend-code
node app.js
```

**特点**：
- ✅ 无需AI API密钥
- ✅ 3秒模拟延迟
- ✅ 快速测试功能
- ✅ 完整的业务流程

### 生产模式（使用真实API）

#### 使用OpenAI

```bash
# 1. 在 .env 文件中配置
ENABLE_REAL_AI_API=true
OPENAI_API_KEY=sk-your-real-api-key-here
OPENAI_MODEL=gpt-3.5-turbo

# 2. 重启服务器
Stop-Process -Name node -Force
node app.js

# 3. 测试
# 系统会自动调用真实的OpenAI API
```

#### 使用通义千问

```bash
# 1. 在 .env 文件中配置
ENABLE_REAL_AI_API=true
QWEN_API_KEY=your-qwen-api-key-here

# 2. 重启服务器
node app.js
```

---

## 🔄 切换模式

### 从模拟切换到真实API

```bash
# 1. 修改 .env
ENABLE_REAL_AI_API=false  →  ENABLE_REAL_AI_API=true

# 2. 添加API密钥
OPENAI_API_KEY=sk-xxxxx

# 3. 重启服务器
Stop-Process -Name node -Force
node app.js

# 4. 验证
# 查看日志，应该显示"调用AI服务: OpenAI"
```

### 从真实API切换回模拟

```bash
# 修改 .env
ENABLE_REAL_AI_API=true  →  ENABLE_REAL_AI_API=false

# 重启服务器
```

---

## 📋 提示词配置

### AI创作提示词

```javascript
系统提示词:
"你是一位专业的学术论文写作助手，擅长撰写各类学术文档。
请根据用户提供的主题、领域和要求，生成高质量的学术内容。"

用户提示词模板:
"请为我撰写一篇关于"${topic}"的${contentTypes.join('、')}。

学科领域：${field}

详细要求：${requirements}

请生成完整、专业的学术内容。"
```

### AI降重提示词

```javascript
系统提示词:
"你是一位专业的论文降重专家，擅长在保持原意的基础上对文本进行改写，降低重复率。"

用户提示词模板:
"请对以下文本进行${level}降重改写：

${text}

要求：
1. 保持原文核心观点不变
2. 使用不同的表达方式
3. 降低重复率
4. 保持学术规范"
```

---

## 🧪 测试AI API

### 测试OpenAI连接

```bash
# 创建测试脚本
node -e "
const axios = require('axios');
axios.post('https://api.openai.com/v1/chat/completions', {
  model: 'gpt-3.5-turbo',
  messages: [{role: 'user', content: 'Hello'}],
  max_tokens: 50
}, {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  }
}).then(res => {
  console.log('✅ OpenAI连接成功');
  console.log(res.data.choices[0].message.content);
}).catch(err => {
  console.log('❌ 连接失败:', err.message);
});
"
```

### 测试通义千问连接

```bash
# 测试阿里云API
node -e "
const axios = require('axios');
axios.post('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
  model: 'qwen-turbo',
  input: {messages: [{role: 'user', content: '你好'}]},
  parameters: {max_tokens: 50}
}, {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  }
}).then(res => {
  console.log('✅ 通义千问连接成功');
  console.log(res.data.output.text);
}).catch(err => {
  console.log('❌ 连接失败:', err.message);
});
"
```

---

## 📊 功能对比

| 功能 | 模拟模式 | 真实API模式 |
|-----|---------|------------|
| **生成速度** | 3秒固定 | 根据内容长度（5-60秒） |
| **生成质量** | 固定模板 | 真实AI生成，质量高 |
| **内容多样性** | 重复内容 | 每次不同 |
| **积分消耗** | 正常扣减 | 正常扣减 |
| **文档保存** | 正常保存 | 正常保存 |
| **多文档支持** | ✅ 支持 | ✅ 支持 |
| **成本** | 免费 | 按API调用收费 |

---

## ⚠️ 注意事项

### 1. API密钥安全

```bash
# ❌ 不要提交到Git
.env

# ✅ 使用环境变量
# ✅ 生产环境使用密钥管理服务
```

### 2. 成本控制

```javascript
// 设置每日调用限制
const DAILY_LIMIT = 1000;

// 监控API使用量
// 超出限制时自动切换到模拟模式
```

### 3. 错误处理

```javascript
// 已实现自动重试
AI_MAX_RETRIES=3

// API失败时的降级策略
if (apiError) {
  // 方案1: 使用模拟内容
  // 方案2: 提示用户稍后重试
  // 方案3: 使用备用API
}
```

### 4. 超时处理

```javascript
// 设置合理的超时时间
AI_API_TIMEOUT=60000  // 60秒

// 长文本生成可能需要更多时间
```

---

## 🔍 调试和监控

### 查看AI API调用日志

```powershell
cd backend-code

# 查看所有日志
Get-Content logs/combined.log -Tail 20

# 查看AI相关日志
Get-Content logs/combined.log | Select-String "AI"

# 查看错误日志
Get-Content logs/error.log -Tail 10
```

### 日志示例

```
info: 开始AI创作任务 123: 深度学习算法研究
info: 调用AI服务: OpenAI
info: AI创作任务 123 生成完成，内容长度: 2500
info: AI创作任务 123: 已保存3个文档
```

---

## 📝 环境变量完整配置

### 完整的 .env 示例

```bash
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_NAME=lunjun_app
DB_USER=root
DB_PASSWORD=243012

# 服务器配置
PORT=3000
NODE_ENV=development

# JWT配置
JWT_SECRET=lunjun_jwt_secret_key_2024
JWT_EXPIRES_IN=7d

# ====== AI API 配置 ======

# 启用真实AI API
ENABLE_REAL_AI_API=false

# OpenAI 配置（推荐）
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-3.5-turbo
OPENAI_API_BASE=https://api.openai.com/v1

# 通义千问配置（备选）
QWEN_API_KEY=your-qwen-key-here
QWEN_MODEL=qwen-turbo

# AI通用配置
AI_API_TIMEOUT=60000
AI_MAX_TOKENS=4000
AI_TEMPERATURE=0.7
AI_MAX_RETRIES=3
AI_MOCK_DELAY=3000
```

---

## ✅ 准备工作清单

- [x] AI配置文件 (`config/ai-api.js`)
- [x] AI服务工具 (`utils/ai-service.js`)
- [x] AI路由集成 (`routes/ai.js`)
- [x] 环境变量示例 (`.env.ai-example`)
- [x] 多文档生成支持
- [x] 错误处理和重试
- [x] 日志记录
- [x] 文档自动保存到文档库
- [x] 积分自动扣减
- [x] 任务状态查询

---

## 🎊 **所有准备工作已完成！**

### 现在可以：

1. ✅ **开发测试**：使用模拟模式快速测试
2. ✅ **接入真实API**：配置API密钥即可切换
3. ✅ **多文档生成**：自动拆分保存
4. ✅ **完整业务流程**：从生成到保存全自动

### 只需要：

1. 📝 在 `.env` 中配置AI API密钥
2. 🔄 设置 `ENABLE_REAL_AI_API=true`
3. 🚀 重启服务器

---

**准备完成！随时可以接入真实AI API！** 🎉

