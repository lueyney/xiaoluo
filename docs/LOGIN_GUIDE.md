# 登录功能使用指南

## 📱 前后端已完全打通

### ✅ 已完成的功能

1. **密码登录** - 支持手机号 + 密码登录
2. **验证码登录** - 支持手机号 + 验证码登录
3. **退出登录** - 完整清除所有登录状态
4. **登录状态管理** - 统一的登录状态检查和管理
5. **表单验证** - 完善的前端表单校验逻辑

---

## 🔐 测试账号

### 账号信息
- **手机号**: `18166973213`
- **密码**: `123456`
- **积分余额**: 1000

### 登录方式

#### 方式一：密码登录
1. 打开小程序登录页面
2. 选择"密码登录"标签页
3. 输入手机号：`18166973213`
4. 输入密码：`123456`
5. 点击"立即登录"

#### 方式二：验证码登录
1. 打开小程序登录页面
2. 选择"验证码登录"标签页
3. 输入手机号：`18166973213`
4. 点击"获取验证码"
5. 查看后端日志获取验证码（开发环境）
6. 输入6位数字验证码
7. 点击"立即登录"

---

## 🛠️ 技术实现

### 前端改进

#### 1. 登录页面增强 (`pages/login/index.js`)
- ✅ 完善的手机号验证（11位，1开头）
- ✅ 密码验证（6-32位）
- ✅ 验证码验证（6位数字）
- ✅ 防重复提交
- ✅ 请求超时处理（10秒）
- ✅ 详细的错误提示
- ✅ 网络异常处理

#### 2. 退出登录功能 (`pages/profile/index.js`)
- ✅ 清除 `userToken`
- ✅ 清除 `userData`
- ✅ 清除全局数据 `app.globalData.userInfo`
- ✅ 使用 `wx.reLaunch` 完全重置应用状态
- ✅ 友好的用户提示

#### 3. 统一登录状态管理 (`utils/auth.js`)
新增工具函数：
- `isLoggedIn()` - 检查是否已登录
- `getUserInfo()` - 获取用户信息
- `getToken()` - 获取 JWT Token
- `requireLogin(redirect)` - 要求登录，未登录自动跳转
- `saveLoginInfo(token, userInfo)` - 保存登录信息
- `clearLoginInfo()` - 清除登录信息
- `logout(callback)` - 退出登录

### 后端配置

#### 1. 数据库连接 (`.env`)
```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=lunjun_app
DB_USER=root
DB_PASSWORD=243012
```

#### 2. API 接口
- `POST /api/auth/login` - 登录接口
  - 支持密码登录：`{phone, password}`
  - 支持验证码登录：`{phone, code}`
- `POST /api/auth/send-code` - 发送验证码
  - 参数：`{phone, scene: 'login'|'register'}`
- `GET /health` - 健康检查

#### 3. 响应格式
```json
{
  "code": "SUCCESS",
  "message": "登录成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "phone": "18166973213",
      "nickname": "用户3213",
      "credits": 1000,
      "vipLevel": "普通会员",
      "inviteCode": "LUNJUN000001"
    }
  }
}
```

---

## 🚀 启动后端服务器

### 方法一：开发模式（推荐）
```powershell
cd backend-code
npm run dev
```

### 方法二：生产模式
```powershell
cd backend-code
$env:NODE_ENV='development'
node app.js
```

### 验证服务器状态
```powershell
Invoke-WebRequest -Uri http://127.0.0.1:3000/health -UseBasicParsing
```

---

## 🔍 获取验证码（开发环境）

验证码会输出在后端日志中：

```powershell
cd backend-code
Get-Content logs/combined.log -Tail 5
```

示例输出：
```
{"level":"info","message":"发送验证码到 18166973213: 553934","service":"lunjun-backend","timestamp":"2025-10-02 12:24:55"}
```

---

## 🧪 测试登录功能

### 测试密码登录
```powershell
cd backend-code
$body = @{phone='18166973213'; password='123456'} | ConvertTo-Json
Invoke-WebRequest -Uri http://127.0.0.1:3000/api/auth/login -Method POST -Body $body -ContentType 'application/json' -UseBasicParsing
```

### 测试验证码登录
```powershell
# 1. 发送验证码
$body = @{phone='18166973213'; scene='login'} | ConvertTo-Json
Invoke-WebRequest -Uri http://127.0.0.1:3000/api/auth/send-code -Method POST -Body $body -ContentType 'application/json' -UseBasicParsing

# 2. 查看日志获取验证码
Get-Content logs/combined.log -Tail 3

# 3. 使用验证码登录（替换 YOUR_CODE 为实际验证码）
$body = @{phone='18166973213'; code='YOUR_CODE'} | ConvertTo-Json
Invoke-WebRequest -Uri http://127.0.0.1:3000/api/auth/login -Method POST -Body $body -ContentType 'application/json' -UseBasicParsing
```

---

## 📝 表单验证规则

### 手机号验证
- ✅ 必填
- ✅ 11位数字
- ✅ 以1开头，第二位为3-9
- ✅ 格式：`/^1[3-9]\d{9}$/`

### 密码验证
- ✅ 必填
- ✅ 最少6位
- ✅ 最多32位

### 验证码验证
- ✅ 必填
- ✅ 6位数字
- ✅ 格式：`/^\d{6}$/`

---

## ⚠️ 常见问题

### 1. 服务器连接失败
**症状**: `ERR_CONNECTION_REFUSED`
**解决**:
```powershell
# 检查服务器是否运行
Get-Process node

# 重启服务器
cd backend-code
node app.js
```

### 2. 密码登录失败
**症状**: "手机号或密码错误"
**解决**: 使用脚本重置密码
```powershell
cd backend-code
node scripts/set-user-password.js
```

### 3. 验证码无法获取
**症状**: 点击"获取验证码"无响应
**解决**:
- 检查手机号格式是否正确
- 检查后端服务器是否运行
- 查看浏览器控制台错误信息

### 4. 退出登录后仍显示已登录
**症状**: 退出登录后页面状态未更新
**解决**: 已修复，使用 `wx.reLaunch` 完全重置应用

---

## 🎯 下一步

1. ✅ 登录功能完成
2. ⏭️ 测试其他需要登录的页面
3. ⏭️ 完善用户信息展示
4. ⏭️ 添加 token 过期自动跳转
5. ⏭️ 完善错误处理和用户体验

---

## 📞 技术支持

如果遇到问题：
1. 检查后端日志：`backend-code/logs/error.log`
2. 检查浏览器控制台
3. 验证数据库连接状态
4. 确认 API 地址配置正确

---

**最后更新**: 2025-10-02
**版本**: 1.0.0
**状态**: ✅ 生产就绪

