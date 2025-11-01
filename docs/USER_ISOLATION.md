# 用户数据隔离方案

## 🔐 问题描述

在多用户系统中，不同用户的数据必须完全隔离，避免数据混淆。

### 原有问题

**问题现象**：
1. 用户 A 登录，积分为 100
2. 用户 A 消费 50 积分，剩余 50
3. 退出登录
4. 用户 B 登录，本应显示自己的 200 积分
5. 但实际显示的是 50 积分（用户 A 的剩余积分）

**根本原因**：
- 积分存储使用固定的 key：`userCredits`
- 所有用户共用同一个本地存储空间
- 切换用户后没有清除和刷新数据

---

## ✅ 解决方案

### 1. **积分存储按用户隔离** (`utils/points.js`)

#### 改进前
```javascript
const STORAGE_KEY = "userCredits";  // 所有用户共用

function getCredits() {
  return wx.getStorageSync(STORAGE_KEY);
}
```

#### 改进后
```javascript
function getUserCreditsKey() {
  const userData = auth.getUserInfo();
  if (userData && userData.id) {
    return `userCredits_${userData.id}`;  // 每个用户独立的key
  }
  return "userCredits";  // 兼容旧版本
}

function getCredits() {
  const key = getUserCreditsKey();
  return wx.getStorageSync(key);
}
```

**存储结构**：
```
userCredits_1 → 100   // 用户ID=1的积分
userCredits_2 → 200   // 用户ID=2的积分
userCredits_3 → 150   // 用户ID=3的积分
```

### 2. **从服务器同步真实积分**

#### 新增功能
```javascript
async function syncCreditsFromServer() {
  const token = auth.getToken();
  const response = await fetch('/api/user/profile', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json();
  setCredits(data.userInfo.credits);  // 更新本地缓存
  return data.userInfo.credits;
}
```

**调用时机**：
- ✅ 登录成功后
- ✅ 页面加载时
- ✅ 积分变化后

### 3. **个人中心实时获取数据** (`pages/profile/index.js`)

#### 改进前
```javascript
onShow() {
  const userData = wx.getStorageSync("userData");
  this.setData({ credits: userData.credits });  // 使用缓存数据
}
```

#### 改进后
```javascript
onShow() {
  this.loadUserInfoFromServer();  // 每次都从服务器获取
}

loadUserInfoFromServer() {
  wx.request({
    url: '/api/user/profile',
    method: 'GET',
    header: { Authorization: `Bearer ${token}` },
    success: (res) => {
      const { userInfo, stats } = res.data.data;
      this.setData({
        userInfo: {
          credits: userInfo.credits,  // 真实积分
          nickname: userInfo.nickname,
          // ...
        },
        stats: stats
      });
      // 更新本地缓存
      points.setCredits(userInfo.credits);
    }
  });
}
```

### 4. **退出登录时清除数据** (`utils/auth.js`)

```javascript
function clearLoginInfo() {
  // 清除 token 和用户数据
  wx.removeStorageSync("userToken");
  wx.removeStorageSync("userData");
  
  // 清除当前用户的积分缓存
  const userData = wx.getStorageSync("userData");
  if (userData && userData.id) {
    wx.removeStorageSync(`userCredits_${userData.id}`);
  }
  
  // 清除全局数据
  const app = getApp();
  if (app && app.globalData) {
    app.globalData.userInfo = null;
  }
}
```

---

## 🔄 完整数据流

### 登录流程

```
1. 用户输入账号密码
   ↓
2. 调用登录 API
   ↓
3. 服务器返回 token + 用户信息（包含积分）
   ↓
4. 保存 token 和用户信息
   auth.saveLoginInfo(token, userInfo)
   ↓
5. 使用用户ID创建独立的积分缓存
   points.setCredits(userInfo.credits)
   → 存储到 userCredits_${userId}
   ↓
6. 跳转到首页
```

### 切换用户流程

```
1. 用户点击"退出登录"
   ↓
2. 清除当前用户的所有数据
   - userToken
   - userData
   - userCredits_${currentUserId}
   ↓
3. 跳转到登录页
   ↓
4. 新用户登录
   ↓
5. 创建新用户的独立数据空间
   - userCredits_${newUserId}
   ↓
6. 显示新用户的积分
```

### 页面刷新流程

```
1. 进入个人中心页面
   ↓
2. 检查登录状态
   ↓
3. 从服务器获取最新数据
   GET /api/user/profile
   ↓
4. 更新页面显示
   this.setData({ credits: serverCredits })
   ↓
5. 同步更新本地缓存
   points.setCredits(serverCredits)
```

---

## 📊 数据存储对比

### Before（问题状态）

```
localStorage:
  userCredits: 50  ← 所有用户共用，显示的是上一个用户的数据
  userToken: "token_B"
  userData: { id: 2, credits: 200 }
```

### After（修复后）

```
localStorage:
  userCredits_1: 100  ← 用户1的积分
  userCredits_2: 200  ← 用户2的积分（当前登录）
  userCredits_3: 150  ← 用户3的积分
  
  userToken: "token_2"
  userData: { id: 2, credits: 200 }
```

---

## 🧪 测试场景

### 测试1：切换用户积分隔离

```javascript
// 1. 用户 A 登录
login('18166973213', '123456');
expect(getCredits()).toBe(1000);  // ✅ 显示用户A的积分

// 2. 用户 A 消费积分
consumeCredits(500);
expect(getCredits()).toBe(500);   // ✅ 剩余500

// 3. 退出登录
logout();

// 4. 用户 B 登录
login('13900000001', 'Pass@123');
expect(getCredits()).toBe(200);   // ✅ 显示用户B的积分（不是500）
```

### 测试2：服务器数据同步

```javascript
// 1. 登录用户
login('18166973213', '123456');

// 2. 在其他设备上消费了积分（数据库中变为900）

// 3. 当前设备刷新页面
onShow();  // 触发 loadUserInfoFromServer()

// 4. 验证显示的是服务器最新数据
expect(getCredits()).toBe(900);  // ✅ 自动同步了最新积分
```

### 测试3：退出登录清除数据

```javascript
// 1. 用户登录
login('18166973213', '123456');

// 2. 使用积分
consumeCredits(100);

// 3. 退出登录
logout();

// 4. 验证数据已清除
expect(getToken()).toBeNull();                    // ✅ token已清除
expect(getUserInfo()).toBeNull();                 // ✅ 用户信息已清除
expect(wx.getStorageSync('userCredits_1')).toBe(undefined);  // ✅ 积分缓存已清除
```

---

## 🎯 改进总结

### 核心改进点

| 项目 | 改进前 | 改进后 |
|-----|--------|--------|
| **积分存储** | 固定key，所有用户共用 | 按用户ID隔离 |
| **数据来源** | 仅使用本地缓存 | 从服务器实时获取 |
| **切换用户** | 数据混淆 | 完全隔离 |
| **退出登录** | 未清除积分缓存 | 完全清除 |
| **页面刷新** | 不更新数据 | 自动同步最新数据 |

### 新增功能

1. ✅ **`getUserCreditsKey()`** - 生成用户独立的存储key
2. ✅ **`syncCreditsFromServer()`** - 从服务器同步积分
3. ✅ **`clearCredits()`** - 清除用户积分缓存
4. ✅ **`loadUserInfoFromServer()`** - 从服务器加载用户信息

---

## 📝 使用指南

### 获取积分（自动隔离）

```javascript
const points = require("../../utils/points.js");

// 获取当前登录用户的积分
const credits = points.getCredits();
console.log(credits);  // 自动获取当前用户的积分
```

### 同步服务器积分

```javascript
// 在页面加载时同步
onShow() {
  points.syncCreditsFromServer()
    .then(credits => {
      console.log('同步成功，当前积分:', credits);
      this.setData({ credits });
    })
    .catch(err => {
      console.error('同步失败:', err);
    });
}
```

### 消费积分

```javascript
// 消费积分（会自动更新当前用户的缓存）
const remaining = points.consumeCredits(50);
console.log('剩余积分:', remaining);
```

---

## ⚠️ 注意事项

1. **服务器为主**：所有重要操作都要先请求服务器，本地缓存仅用于展示
2. **实时同步**：进入页面时从服务器获取最新数据
3. **完全清除**：退出登录时清除所有用户数据
4. **错误处理**：网络失败时使用本地缓存，但要提示用户

---

## 🚀 下一步优化

1. ⏭️ 添加积分变动通知
2. ⏭️ 实现积分交易记录查询
3. ⏭️ 添加积分不足时的充值引导
4. ⏭️ 支持积分冻结和解冻

---

**最后更新**: 2025-10-02
**版本**: 2.0.0
**状态**: ✅ 已修复

