# PaperFake降重功能故障排查指南

## 问题现象
AI降重功能显示"降重失败"，但一个月前在本地调试时可以正常使用。

## 可能原因

### 1. 环境变量未配置（最常见）
**症状**: 后端日志显示 "PaperFake账号未配置"

**解决方案**:
1. 检查 `.env` 文件是否包含以下配置:
   ```env
   PAPERFAKE_USERNAME=你的用户名
   PAPERFAKE_PASSWORD=你的密码
   PAPERFAKE_API_BASE=https://paperfake.cn/pcserver
   ```

2. 如果使用云托管（如微信云托管），需要在云托管控制台的环境变量配置中添加这些变量。

3. 重启后端服务使配置生效。

### 2. API密钥过期或错误
**症状**: API返回错误码（errCode !== 0）

**解决方案**:
1. 登录 PaperFake 官网确认账号状态
2. 检查用户名和密码是否正确
3. 如果账号已过期，需要续费或联系 PaperFake 客服

### 3. 网络连接问题
**症状**: 无法连接到 API 服务器，请求超时

**解决方案**:
1. 检查服务器网络是否正常
2. 检查防火墙是否阻止了对 `paperfake.cn` 的访问
3. 尝试在服务器上直接访问 `https://paperfake.cn/pcserver`

### 4. API响应格式变化
**症状**: API调用成功但无法提取降重结果

**解决方案**:
查看后端日志中的完整 API 响应，如果格式发生变化，需要更新 `backend-code/routes/rewrite.js` 中的响应解析逻辑。

## 诊断步骤

### 步骤1: 运行诊断脚本
```bash
cd backend-code
npm run check-paperfake
```

这个脚本会：
- 检查环境变量是否配置
- 测试 API 连接
- 验证认证是否成功

### 步骤2: 查看后端日志
查看 `backend-code/logs/combined.log` 和 `backend-code/logs/error.log`，搜索 "AI降重" 或 "PaperFake" 相关的错误信息。

### 步骤3: 手动测试API
如果诊断脚本显示配置正确但仍无法使用，可以手动测试：

```bash
curl -X POST https://paperfake.cn/pcserver/sa/saReduceAIGCTextV2 \
  -H "Content-Type: application/json" \
  -d '{
    "text": "测试文本",
    "lang": "zh",
    "reduceRepeat": false,
    "sa_username": "你的用户名",
    "sa_password": "你的密码",
    "zhPlatform": "cnki"
  }'
```

## 常见错误信息

| 错误信息 | 可能原因 | 解决方案 |
|---------|---------|---------|
| `PaperFake账号未配置` | 环境变量未设置 | 检查并设置环境变量 |
| `无法连接到降重服务` | 网络问题 | 检查网络连接和防火墙 |
| `降重服务响应超时` | API响应慢或网络慢 | 检查网络或联系 PaperFake 客服 |
| `API返回错误码: XXX` | 认证失败或账号问题 | 检查用户名密码或账号状态 |
| `AI降重未返回有效内容` | API响应格式变化 | 查看日志中的完整响应，更新解析逻辑 |

## 联系支持

如果以上方法都无法解决问题，请：
1. 收集完整的错误日志
2. 运行诊断脚本并保存输出
3. 联系技术支持并提供以上信息















