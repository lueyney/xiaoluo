# Coze API 认证问题解决方案

## ❌ 当前问题

```
错误: 401 未经授权
{
  "code": 4100,
  "msg": "authentication is invalid",
  "detail": {"logid": "20251002200259789714146E4E45A96DAD"}
}
```

---

## 🔍 可能的原因

### 1. **API Token已过期或失效**
- Coze的Personal Access Token可能有有效期
- 需要重新生成

### 2. **Token格式不正确**
- 确认Token是否完整
- 检查是否有多余的空格或换行

### 3. **Workflow权限问题**
- Token对应的账号可能没有该workflow的访问权限

---

## ✅ 解决方案

### 方案1：重新获取Coze API Token（推荐）

#### 步骤：

1. **登录Coze平台**
   ```
   访问: https://www.coze.cn/
   登录您的账号
   ```

2. **进入个人中心**
   ```
   点击头像 → 个人中心 → API管理
   ```

3. **创建新的Personal Access Token**
   ```
   点击"创建Token"
   设置名称: "论文君小程序"
   设置权限: 允许调用workflow
   复制生成的Token
   ```

4. **更新.env配置**
   ```bash
   cd backend-code
   
   # 编辑.env文件，更新Token
   COZE_API_KEY=新的Token
   ```

5. **重启服务器**
   ```powershell
   Stop-Process -Name node -Force
   Set-Location 'C:\Users\Administrator\Desktop\2025.9.24\backend-code'
   node app.js
   ```

---

### 方案2：暂时使用模拟模式（用于开发测试）

```bash
# 修改.env
ENABLE_REAL_AI_API=false

# 重启服务器
```

**特点**：
- ✅ 无需真实API
- ✅ 快速测试功能
- ✅ 3秒生成模拟内容
- ✅ 所有业务流程正常

---

## 🧪 验证Token是否有效

### 使用curl测试（PowerShell）

```powershell
$headers = @{
  'Authorization' = 'Bearer 您的新Token'
  'Content-Type' = 'application/json'
}

$body = @{
  workflow_id = '7556513690260078628'
  parameters = @{ input = '测试' }
  connector_id = '10000126'
} | ConvertTo-Json

try {
  $response = Invoke-WebRequest `
    -Uri 'https://api.coze.cn/v1/workflow/stream_run' `
    -Method POST `
    -Headers $headers `
    -Body $body `
    -UseBasicParsing
  
  Write-Host "✅ Token有效，连接成功"
} catch {
  Write-Host "❌ Token无效"
  Write-Host $_.Exception.Message
}
```

---

## 🔄 当前系统状态

### 已配置但Token失效

```
✅ 代码已完全集成Coze
✅ 流式响应处理已实现
✅ 多文档生成已支持
❌ API Token需要更新

解决方案:
1. 获取新的Coze Token
2. 或暂时使用模拟模式
```

---

## 🎯 推荐方案

### 开发阶段（当前）

```bash
# 使用模拟模式
ENABLE_REAL_AI_API=false
```

**优势**：
- 快速测试所有功能
- 无需等待真实AI生成
- 节省API调用成本
- 所有业务流程完整

### 生产部署

```bash
# 使用真实Coze API
ENABLE_REAL_AI_API=true
COZE_API_KEY=有效的Token
```

---

## 📝 待办事项

### 解决Coze认证问题

- [ ] 登录Coze平台
- [ ] 重新生成Personal Access Token
- [ ] 更新.env文件
- [ ] 重启服务器
- [ ] 测试验证

### 或使用模拟模式

- [ ] 设置 ENABLE_REAL_AI_API=false
- [ ] 重启服务器
- [ ] ✅ 立即可用

---

## ✅ 临时解决方案

**现在立即可用的方法**：

```powershell
cd backend-code

# 1. 切换到模拟模式
(Get-Content .env) -replace 'ENABLE_REAL_AI_API=true', 'ENABLE_REAL_AI_API=false' | Set-Content .env

# 2. 重启服务器
Stop-Process -Name node -Force
Set-Location 'C:\Users\Administrator\Desktop\2025.9.24\backend-code'
node app.js

# 3. 测试
# 所有功能正常，使用模拟生成
# 等获取到有效的Coze Token后再切换回真实API
```

---

## 📞 技术支持

如需帮助：
1. 检查Coze平台是否有新的Token管理方式
2. 确认workflow_id是否正确
3. 确认账号是否有权限访问该workflow

---

**建议：先使用模拟模式测试所有功能，待获取有效Token后再切换到真实API。** 💡

