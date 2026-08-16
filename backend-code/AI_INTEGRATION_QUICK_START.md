# AI API 接入快速指南

## 🎯 当前状态

✅ **所有准备工作已完成，随时可以接入真实AI API！**

---

## 📦 已安装的依赖

```json
{
  "axios": "^1.6.0"  // AI API调用
}
```

---

## 📁 已创建的文件

| 文件 | 功能 | 状态 |
|-----|------|------|
| `config/ai-api.js` | AI提供商配置管理 | ✅ 完成 |
| `utils/ai-service.js` | AI服务调用工具 | ✅ 完成 |
| `routes/ai.js` | AI路由（已集成） | ✅ 完成 |
| `.env.ai-example` | AI配置示例 | ✅ 完成 |
| `.env` | 包含AI配置 | ✅ 完成 |

---

## 🚀 三步接入真实AI API

### 方式一：使用 OpenAI（推荐）

#### 步骤1：获取API密钥
```
访问: https://platform.openai.com/api-keys
创建API密钥: sk-xxxxx...
```

#### 步骤2：配置.env
```bash
# 打开 backend-code/.env 文件
# 修改以下配置：

ENABLE_REAL_AI_API=true
OPENAI_API_KEY=sk-your-real-api-key-here
OPENAI_MODEL=gpt-3.5-turbo
```

#### 步骤3：重启服务器
```powershell
cd backend-code
Stop-Process -Name node -Force
node app.js
```

✅ **完成！现在所有AI功能都会使用真实的OpenAI API！**

---

### 方式二：使用阿里云通义千问

#### 步骤1：获取API密钥
```
访问: https://dashscope.console.aliyun.com/
创建API-KEY
```

#### 步骤2：配置.env
```bash
ENABLE_REAL_AI_API=true
QWEN_API_KEY=your-qwen-api-key-here
QWEN_MODEL=qwen-turbo
```

#### 步骤3：重启服务器
```powershell
Stop-Process -Name node -Force
node app.js
```

---

### 方式三：使用百度文心一言

#### 步骤1：获取密钥
```
访问: https://cloud.baidu.com/product/wenxinworkshop
创建应用，获取API Key和Secret Key
```

#### 步骤2：配置.env
```bash
ENABLE_REAL_AI_API=true
WENXIN_API_KEY=your-api-key
WENXIN_SECRET_KEY=your-secret-key
```

#### 步骤3：重启服务器

---

## 🔍 验证AI API是否生效

### 方法1：查看日志

```powershell
# 启动服务器后，查看日志
cd backend-code
Get-Content logs/combined.log -Wait

# 使用AI创作功能，应该看到：
# 如果是模拟模式：
info: 使用模拟AI服务

# 如果是真实API：
info: 调用AI服务: OpenAI
info: AI创作任务 123 生成完成，内容长度: 2500
```

### 方法2：测试创作功能

```powershell
# 登录
$body = @{phone='18166973213'; password='123456'} | ConvertTo-Json
$response = Invoke-WebRequest -Uri http://127.0.0.1:3000/api/auth/login -Method POST -Body $body -ContentType 'application/json' -UseBasicParsing
$token = ($response.Content | ConvertFrom-Json).data.token

# 提交AI创作任务
$headers = @{'Authorization'="Bearer $token"; 'Content-Type'='application/json; charset=utf-8'}
$body = '{"field":"计算机科学","topic":"测试AI接入","contentTypes":["学术论文"],"requirements":"测试真实AI API"}'
$encoded = [System.Text.Encoding]::UTF8.GetBytes($body)
$response = Invoke-WebRequest -Uri http://127.0.0.1:3000/api/ai/writing -Method POST -Headers $headers -Body $encoded -UseBasicParsing
$result = $response.Content | ConvertFrom-Json

Write-Host "任务ID: $($result.data.taskId)"
Write-Host "预计时间: $($result.data.estimatedTime)秒"

# 等待30秒后查询结果
Start-Sleep -Seconds 30
$response = Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/ai/task/$($result.data.taskId)" -Method GET -Headers $headers -UseBasicParsing
$task = $response.Content | ConvertFrom-Json
Write-Host "任务状态: $($task.data.status)"

# 如果完成，查看文档库
if ($task.data.status -eq 'completed') {
  $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/documents' -Method GET -Headers $headers -UseBasicParsing
  $docs = $response.Content | ConvertFrom-Json
  Write-Host "✅ 文档已保存到文档库"
  Write-Host "总文档数: $($docs.data.pagination.total)"
}
```

---

## 🎯 核心功能

### 1. AI创作（已集成）

- ✅ 调用 `generateWriting(params)`
- ✅ 自动扣减积分
- ✅ **支持多文档生成**（多个类型分别保存）
- ✅ 保存到文档库
- ✅ 发送完成通知
- ✅ 记录积分交易

### 2. AI降重（已集成）

- ✅ 调用 `generateRewrite(params)`
- ✅ 三个降重等级
- ✅ 自动计算相似度
- ✅ 保存降重文档
- ✅ 完整的业务流程

### 3. 任务管理（已实现）

- ✅ 创建任务返回taskId
- ✅ 查询任务状态
- ✅ 获取任务列表
- ✅ 任务状态：processing/completed/failed

---

## 📊 业务流程

### 完整的AI创作流程

```
用户在前端选择:
  - 主题: "深度学习"
  - 类型: 学术论文、开题报告、任务书
  - 领域: 计算机科学
  ↓
前端调用: POST /api/ai/writing
  ↓
后端：
  1. 验证积分是否足够
  2. 创建任务记录
  3. 返回taskId
  4. 异步调用AI服务
  ↓
AI服务:
  - 根据配置选择提供商
  - 调用真实API或模拟
  - 生成文本内容
  ↓
后端处理结果:
  1. 扣减积分
  2. 保存3个独立文档：
     - 深度学习 - 学术论文
     - 深度学习 - 开题报告
     - 深度学习 - 任务书
  3. 记录交易
  4. 发送通知
  ↓
前端:
  1. 轮询任务状态
  2. 获取生成内容
  3. 刷新文档库
  4. 显示3个文档 ✅
```

---

## 🔒 安全性

### 1. API密钥保护
- ✅ 存储在环境变量
- ✅ 不提交到Git
- ✅ 生产环境使用密钥管理服务

### 2. 用户验证
- ✅ 所有AI接口需要Token
- ✅ 验证用户积分
- ✅ 记录所有操作

### 3. 错误处理
- ✅ API调用失败自动重试
- ✅ 超时自动处理
- ✅ 详细的错误日志

---

## 📞 技术支持

### 常见问题

#### Q1: 如何知道当前使用的是哪个AI提供商？
```powershell
# 查看日志
Get-Content logs/combined.log | Select-String "调用AI服务"

# 输出示例
info: 调用AI服务: OpenAI
```

#### Q2: API调用失败怎么办？
```
1. 检查API密钥是否正确
2. 检查网络连接
3. 查看错误日志
4. 确认API账户余额
5. 临时切换回模拟模式
```

#### Q3: 如何从模拟切换到真实API？
```bash
# 修改 .env
ENABLE_REAL_AI_API=false  →  true

# 重启服务器
```

#### Q4: 真实API太贵，如何控制成本？
```
1. 使用模拟模式开发
2. 设置每日调用限制
3. 监控API使用量
4. 使用更便宜的模型（如gpt-3.5-turbo）
5. 缓存常见问题的回答
```

---

## 🎊 **准备完成！**

### 当前状态

- ✅ 模拟模式运行正常
- ✅ 真实API接口已准备好
- ✅ 多文档生成功能已实现
- ✅ 文档自动保存到文档库
- ✅ 所有业务流程打通

### 接入真实API只需：

1. 配置API密钥（1分钟）
2. 修改一个环境变量（1行代码）
3. 重启服务器（1个命令）

---

**随时可以接入真实AI API！** 🚀

