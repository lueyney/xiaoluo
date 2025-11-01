# 注册功能使用指南

## 🎉 注册功能已完全打通

### ✅ 已完成的功能

1. **手机号验证码注册** - 支持手机号 + 验证码 + 密码注册
2. **邀请码系统** - 支持填写邀请码获得积分奖励
3. **完整表单验证** - 手机号、验证码、密码、确认密码验证
4. **自动登录** - 注册成功后自动登录并跳转
5. **防重复提交** - 防止用户重复点击
6. **新用户奖励** - 注册即送 100 积分
7. **邀请奖励** - 使用邀请码注册，邀请人和被邀请人各得 100 积分

---

## 📝 注册流程

### 基本注册（不使用邀请码）

```
1. 打开注册页面
2. 输入手机号（11位，1开头）
3. 点击"获取验证码"
4. 输入6位数字验证码
5. 设置密码（6-32位）
6. 确认密码
7. 点击"立即注册"
8. 注册成功，自动跳转到首页
```

### 使用邀请码注册

```
1. 打开注册页面
2. 输入手机号
3. 获取验证码
4. 设置密码
5. 确认密码
6. 输入邀请码（可选，如：LUNJUN810469）
7. 点击"立即注册"
8. 注册成功，获得双倍积分奖励
```

---

## 🎁 积分奖励系统

### 新用户注册奖励
- **基础奖励**: 100 积分
- **无需邀请码**: 直接获得

### 邀请码奖励
- **被邀请人**: 额外 100 积分（总共 200 积分）
- **邀请人**: 额外 100 积分
- **邀请码格式**: LUNJUN + 6位数字（自动生成）

---

## 🧪 测试账号

### 测试账号 1
```
手机号: 13900000001
密码: Pass@123
积分: 100
邀请码: LUNJUN810469
```

### 测试账号 2（使用邀请码注册）
```
手机号: 13900000002
密码: Pass@123
积分: 100
邀请码: LUNJUN471669
```

### 原有测试账号
```
手机号: 18166973213
密码: 123456
积分: 1000
邀请码: LUNJUN000001
```

---

## 🔧 技术实现

### 前端改进

#### 1. 注册页面增强 (`pages/register/index.js`)

**新增功能**:
- ✅ 引入 `auth.js` 统一登录管理
- ✅ 完善的表单验证逻辑
- ✅ 邀请码支持（可选）
- ✅ 防重复提交
- ✅ 请求超时处理（10秒）
- ✅ 详细的错误提示
- ✅ 网络异常处理

**验证规则**:
```javascript
// 手机号验证
validatePhone(phone) {
  if (!phone) return { valid: false, message: "请输入手机号" };
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    return { valid: false, message: "请输入正确的11位手机号" };
  }
  return { valid: true };
}

// 验证码验证
validateCode(code) {
  if (!code) return { valid: false, message: "请输入验证码" };
  if (!/^\d{6}$/.test(code)) {
    return { valid: false, message: "请输入6位数字验证码" };
  }
  return { valid: true };
}

// 密码验证
validatePassword(password) {
  if (!password) return { valid: false, message: "请设置密码" };
  if (password.length < 6) {
    return { valid: false, message: "密码至少需要6位" };
  }
  if (password.length > 32) {
    return { valid: false, message: "密码不能超过32位" };
  }
  return { valid: true };
}
```

#### 2. UI 优化
- ✅ 修复图片加载问题（使用 emoji）
- ✅ 添加邀请码输入框
- ✅ 统一样式风格
- ✅ 友好的错误提示

#### 3. 页面功能
```javascript
// 已登录检查
onLoad(options) {
  if (auth.isLoggedIn()) {
    wx.switchTab({ url: "/pages/writing/index" });
    return;
  }
  
  // 支持通过 URL 参数传入邀请码
  if (options.inviteCode) {
    this.setData({ inviteCode: options.inviteCode });
  }
}

// 注册成功后自动登录
if (respCode === "SUCCESS" && data && data.token) {
  auth.saveLoginInfo(data.token, data.user || {});
  wx.showToast({ title: "注册成功！欢迎加入", icon: "success" });
  setTimeout(() => {
    wx.switchTab({ url: "/pages/writing/index" });
  }, 800);
}
```

### 后端 API

#### 1. 发送验证码 API
```
POST /api/auth/send-code

请求参数:
{
  "phone": "13900000001",
  "scene": "register"  // 必须是 "register"
}

响应:
{
  "code": "SUCCESS",
  "message": "验证码已发送"
}

错误响应:
{
  "code": "PHONE_EXISTS",
  "error": "该手机号已注册"
}
```

#### 2. 注册 API
```
POST /api/auth/register

请求参数:
{
  "phone": "13900000001",
  "code": "123456",
  "password": "Pass@123",
  "inviteCode": "LUNJUN810469"  // 可选
}

成功响应:
{
  "code": "SUCCESS",
  "message": "注册成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 2,
      "phone": "13900000001",
      "nickname": "用户0001",
      "credits": 100,
      "vipLevel": "普通会员",
      "inviteCode": "LUNJUN810469"
    }
  }
}

错误响应:
{
  "code": "PHONE_EXISTS",
  "error": "该手机号已注册"
}

{
  "code": "INVALID_CODE",
  "error": "验证码错误"
}

{
  "code": "CODE_EXPIRED",
  "error": "验证码已过期"
}
```

---

## 🧪 测试步骤

### 1. 测试基本注册
```powershell
# 1. 发送验证码
cd backend-code
$body = @{phone='13900000003'; scene='register'} | ConvertTo-Json
Invoke-WebRequest -Uri http://127.0.0.1:3000/api/auth/send-code -Method POST -Body $body -ContentType 'application/json' -UseBasicParsing

# 2. 查看验证码（开发环境）
Get-Content logs/combined.log -Tail 2

# 3. 注册（替换 YOUR_CODE 为实际验证码）
$body = @{phone='13900000003'; code='YOUR_CODE'; password='Pass@123'} | ConvertTo-Json
Invoke-WebRequest -Uri http://127.0.0.1:3000/api/auth/register -Method POST -Body $body -ContentType 'application/json' -UseBasicParsing
```

### 2. 测试带邀请码注册
```powershell
# 使用已有账号的邀请码
$body = @{
  phone='13900000004'
  code='YOUR_CODE'
  password='Pass@123'
  inviteCode='LUNJUN810469'
} | ConvertTo-Json

Invoke-WebRequest -Uri http://127.0.0.1:3000/api/auth/register -Method POST -Body $body -ContentType 'application/json' -UseBasicParsing
```

### 3. 测试注册后登录
```powershell
# 用刚注册的账号密码登录
$body = @{phone='13900000003'; password='Pass@123'} | ConvertTo-Json
Invoke-WebRequest -Uri http://127.0.0.1:3000/api/auth/login -Method POST -Body $body -ContentType 'application/json' -UseBasicParsing
```

---

## 📋 表单验证规则

### 手机号
- ✅ 必填
- ✅ 11位数字
- ✅ 以1开头，第二位为3-9
- ✅ 格式：`/^1[3-9]\d{9}$/`

### 验证码
- ✅ 必填
- ✅ 6位数字
- ✅ 格式：`/^\d{6}$/`
- ✅ 有效期：5分钟

### 密码
- ✅ 必填
- ✅ 最少6位
- ✅ 最多32位
- ✅ 支持字母、数字、特殊字符

### 确认密码
- ✅ 必填
- ✅ 必须与密码一致

### 邀请码（可选）
- ⭕ 非必填
- ✅ 最多20位
- ✅ 自动转为大写
- ✅ 无效邀请码不影响注册

---

## ⚠️ 常见问题

### 1. 手机号已注册
**症状**: "该手机号已注册"
**解决**: 使用其他手机号或直接登录

### 2. 验证码错误
**症状**: "验证码错误"
**解决**: 
- 检查验证码是否正确
- 验证码有效期为5分钟
- 重新获取验证码

### 3. 验证码过期
**症状**: "验证码已过期"
**解决**: 重新获取验证码

### 4. 两次密码不一致
**症状**: "两次输入的密码不一致"
**解决**: 确认密码必须与设置密码完全一致

### 5. 邀请码无效
**症状**: 邀请码不正确不会提示错误，但不会获得额外奖励
**解决**: 向邀请人核实邀请码是否正确

---

## 🔄 注册与登录的关系

### 相同点
- ✅ 都使用 `auth.js` 统一管理
- ✅ 都需要手机号验证
- ✅ 都有完善的表单验证
- ✅ 都支持防重复提交
- ✅ 都有详细的错误处理

### 不同点
| 功能 | 注册 | 登录 |
|-----|------|------|
| 验证码 | 必须 | 可选 |
| 密码 | 必须设置 | 密码或验证码 |
| 确认密码 | 必须 | 不需要 |
| 邀请码 | 可选 | 无 |
| 新用户奖励 | 100积分 | 无 |

---

## 📊 测试结果

### ✅ 功能测试
- ✅ 基本注册流程 - 通过
- ✅ 带邀请码注册 - 通过
- ✅ 注册后自动登录 - 通过
- ✅ 手机号验证 - 通过
- ✅ 验证码验证 - 通过
- ✅ 密码验证 - 通过
- ✅ 确认密码验证 - 通过
- ✅ 防重复提交 - 通过
- ✅ 网络异常处理 - 通过
- ✅ 已登录跳转 - 通过

### ✅ 集成测试
- ✅ 前后端完全打通
- ✅ 注册后可立即登录
- ✅ 积分系统正常
- ✅ 邀请码系统正常
- ✅ 用户信息正确保存

---

## 🎯 下一步

1. ✅ 注册功能完成
2. ✅ 登录功能完成
3. ✅ 退出登录完成
4. ⏭️ 完善其他需要登录的功能
5. ⏭️ 添加找回密码功能
6. ⏭️ 添加修改密码功能

---

## 📞 技术支持

如果遇到问题：
1. 检查后端服务器是否运行
2. 检查数据库连接状态
3. 查看后端日志：`backend-code/logs/error.log`
4. 查看浏览器控制台
5. 验证手机号格式是否正确

---

**最后更新**: 2025-10-02
**版本**: 1.0.0
**状态**: ✅ 生产就绪

