# 抖音支付完整生效检查清单

## ⚠️ 重要提示
**仅配置环境变量是不够的！** 还需要完成以下所有步骤，支付功能才能完全生效。

---

## ✅ 第一步：环境变量配置（后端服务器）

### 必须配置的环境变量

```env
# 抖音小程序基础配置
DOUYIN_APP_ID=tt370c41b1a80133a501          # 抖音小程序 AppID
DOUYIN_APP_SECRET=xxxxxxxx                  # 抖音小程序 AppSecret

# 抖音支付配置（在抖音开发者后台 -> 支付设置中查看）
DOUYIN_MERCHANT_ID=xxxxxxxx                  # 商户号
DOUYIN_PAY_SALT=xxxxxxxx                     # 支付签名 SALT
DOUYIN_PAY_TOKEN=xxxxxxxx                   # 回调验证 Token（必须与抖音后台配置一致）
```

### 配置后必须操作
- ✅ **重启后端服务**（环境变量修改后必须重启才能生效）
- ✅ 验证环境变量是否生效（查看后端日志，确认不再显示"未配置抖音支付"）

---

## ✅ 第二步：抖音开发者后台配置

### 1. 支付功能开通（最重要！）

**位置：** 抖音开发者后台 -> 支付 -> 支付管理

**必须完成：**
- [ ] **申请开通支付功能**（如果还没开通）
  - 填写商户信息
  - 提交资质审核
  - **等待审核通过**（通常需要1-3个工作日）
- [ ] **确认支付功能已开通**（状态显示"已开通"）

⚠️ **如果没有开通支付功能，即使配置了所有环境变量，支付也无法使用！**

### 2. 支付设置配置

**位置：** 抖音开发者后台 -> 支付 -> 支付设置

**必须填写：**
- [ ] **URL（服务器地址）：** `https://yaoguang.yaoguangxiaoluo.cn/api/douyin/pay/notify`
- [ ] **Token（令牌）：** 必须与后端环境变量 `DOUYIN_PAY_TOKEN` **完全一致**
- [ ] **SALT（盐）：** 点击"眼睛"图标复制，填入后端环境变量 `DOUYIN_PAY_SALT`
- [ ] **支付方式开关：** 确保"支付宝支付"和"微信支付"都是**开启**状态

⚠️ **Token 值必须与后端环境变量完全一致，包括大小写、空格等！**

### 3. 服务器域名配置

**位置：** 抖音开发者后台 -> 开发 -> 开发设置 -> 服务器域名

**必须添加：**
- [ ] **request 合法域名：** `https://yaoguang.yaoguangxiaoluo.cn`
- [ ] **downloadFile 合法域名：** `https://yaoguang.yaoguangxiaoluo.cn`（如果需要下载文件）

### 4. 隐私协议配置

**位置：** 抖音开发者后台 -> 设置 -> 隐私设置

**必须完成：**
- [ ] 配置用户隐私保护指引
- [ ] 声明收集"用户信息"和"手机号"
- [ ] 提交审核并等待通过

---

## ✅ 第三步：数据库配置

### 必须执行的 SQL

```sql
-- 1. 添加 douyin_openid 字段（如果还没执行）
ALTER TABLE `users` ADD COLUMN `douyin_openid` VARCHAR(64) NULL COMMENT '抖音用户ID' AFTER `openid`;

-- 2. 添加索引（如果还没执行）
ALTER TABLE `users` ADD INDEX `idx_douyin_openid` (`douyin_openid`);
```

**执行方法：**
```bash
mysql -u root -p lunjun_app < backend-code/database/add_douyin_openid.sql
```

---

## ✅ 第四步：后端服务检查

### 1. 确认路由已注册

检查 `backend-code/app.js` 第 123-124 行：
```javascript
app.use('/api/douyin/auth', douyinAuthRoutes);  // 抖音登录路由
app.use('/api/douyin/pay', douyinPayRoutes);  // 抖音支付路由
```

### 2. 确认服务已重启

- [ ] 环境变量配置后已重启后端服务
- [ ] 服务正常运行（访问 `/health` 返回正常）

### 3. 测试接口可访问

```bash
# 测试创建订单接口（需要认证token）
curl -X POST https://yaoguang.yaoguangxiaoluo.cn/api/douyin/pay/create-order \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"test","packageId":1,"amount":9.90,"credits":1000}'
```

---

## ✅ 第五步：前端代码检查

### 1. 确认支付调用代码

检查 `ttcode/pages/recharge/index.js`：
- [ ] `tt.pay` 调用参数正确（`order_id` 和 `order_token`）
- [ ] `service: 5` 已设置（担保交易固定值）
- [ ] 支付成功回调已实现

### 2. 确认 API 地址配置

检查 `ttcode/app.js`：
- [ ] `apiBaseUrl` 配置正确：`https://yaoguang.yaoguangxiaoluo.cn`

---

## ✅ 第六步：功能测试

### 登录功能测试
- [ ] 隐私弹窗正常显示
- [ ] 一键登录按钮可点击
- [ ] 登录成功并获取 token

### 支付功能测试
- [ ] 创建订单接口返回 `order_id` 和 `order_token`（不是 mock 数据）
- [ ] `tt.pay` 成功调起支付界面
- [ ] 支付成功后回调正常
- [ ] 积分正确增加
- [ ] 订单状态正确更新

---

## 🔍 验证支付是否生效的方法

### 方法1：查看后端日志

创建订单时，查看后端日志：
- ✅ **如果生效：** 日志显示"✅ 支付参数生成成功"，返回真实的 `order_id` 和 `order_token`
- ❌ **如果未生效：** 日志显示"⚠️ 未配置抖音支付，返回模拟模式"，返回 `mock: true`

### 方法2：测试创建订单接口

调用创建订单接口，检查返回数据：
- ✅ **如果生效：** `payInfo` 包含真实的 `order_id` 和 `order_token`，没有 `mock: true`
- ❌ **如果未生效：** `payInfo` 包含 `mock: true`，`order_token` 为 `'mock_token'`

### 方法3：前端支付测试

在抖音开发者工具中测试支付：
- ✅ **如果生效：** `tt.pay` 成功调起支付界面
- ❌ **如果未生效：** `tt.pay` 报错或无法调起支付

---

## ⚠️ 常见问题

### 问题1：支付功能未开通
**现象：** 创建订单返回 mock 数据，或 `tt.pay` 报错
**解决：** 在抖音开发者后台申请开通支付功能，等待审核通过

### 问题2：环境变量未生效
**现象：** 后端日志显示"未配置抖音支付"
**解决：** 
1. 确认环境变量已正确配置
2. **重启后端服务**（必须！）
3. 检查环境变量名称是否正确（注意大小写）

### 问题3：Token 不一致
**现象：** 支付回调验签失败
**解决：** 
1. 检查后端环境变量 `DOUYIN_PAY_TOKEN` 的值
2. 检查抖音后台"支付设置"中的 Token 值
3. **两者必须完全一致**（包括大小写、空格、特殊字符）

### 问题4：支付接口返回 404
**现象：** 前端显示"接口不存在"
**解决：**
1. 确认后端服务已启动
2. 确认路由已注册
3. 确认请求路径正确：`/api/douyin/pay/create-order`

---

## 📋 完整生效检查清单

### 后端配置
- [ ] 环境变量已配置（`DOUYIN_APP_ID`, `DOUYIN_APP_SECRET`, `DOUYIN_MERCHANT_ID`, `DOUYIN_PAY_SALT`, `DOUYIN_PAY_TOKEN`）
- [ ] 后端服务已重启
- [ ] 路由已注册
- [ ] 数据库字段已添加

### 抖音后台配置
- [ ] **支付功能已开通**（最重要！）
- [ ] 支付设置已配置（URL、Token、SALT）
- [ ] 服务器域名已配置
- [ ] 隐私协议已配置并审核通过

### 前端配置
- [ ] API 地址配置正确
- [ ] 支付调用代码正确

### 功能测试
- [ ] 登录功能正常
- [ ] 创建订单返回真实数据（非 mock）
- [ ] 支付界面可调起
- [ ] 支付成功回调正常
- [ ] 积分正确增加

---

## 🎯 总结

**仅配置环境变量是不够的！** 必须完成：

1. ✅ **环境变量配置** + **重启服务**
2. ✅ **抖音支付功能开通**（最重要！）
3. ✅ **抖音后台支付设置配置**
4. ✅ **服务器域名配置**
5. ✅ **数据库字段添加**
6. ✅ **功能测试验证**

**只有完成以上所有步骤，支付功能才能完全生效！**

