# 抖音小程序部署检查清单

## ✅ 已完成的功能

### 前端（ttcode）
1. ✅ 隐私协议弹窗组件 (`components/privacy-popup`)
2. ✅ 登录页隐私 gating + code 刷新逻辑
3. ✅ 登录接口对接 (`/api/douyin/auth/login`)
4. ✅ 充值页 iOS 屏蔽逻辑
5. ✅ 充值接口对接 (`/api/douyin/pay/create-order`)
6. ✅ 支付调用 (`tt.pay`)

### 后端（backend-code）
1. ✅ 抖音登录接口 (`routes/douyin-auth.js`)
2. ✅ 抖音支付预下单接口 (`routes/douyin-pay.js`)
3. ✅ 支付回调接口 (`routes/douyin-pay.js`)
4. ✅ 支付签名算法 (`utils/douyin.js`)
5. ✅ 回调验签逻辑
6. ✅ 防重复发放逻辑
7. ✅ 账户合并逻辑（手机号锚点）

## 🔧 必须配置的环境变量

### 云托管环境变量（必须配置）

```bash
# 抖音小程序基础配置
DOUYIN_APP_ID=tt370c41b1a80133a501          # 抖音小程序 AppID
DOUYIN_APP_SECRET=xxxxxxxx                  # 抖音小程序 AppSecret（在开发者后台查看）

# 抖音支付配置（在抖音开发者后台 -> 支付设置中查看）
DOUYIN_MERCHANT_ID=xxxxxxxx                  # 商户号
DOUYIN_PAY_SALT=xxxxxxxx                     # 支付签名 SALT（点击"眼睛"图标复制）
DOUYIN_PAY_TOKEN=jdioaFQWGEQWRHWTEHDFBGHFHYQAWTGDSFHGFHSDBCV  # 回调验证 Token（必须与抖音后台配置一致）

# 数据库配置（如果还没配置）
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=xxxxx
DB_NAME=lunjun_app
```

## 📋 抖音开发者后台配置

### 1. 服务器域名配置
**位置：** 抖音开发者后台 -> 开发 -> 开发设置 -> 服务器域名

**需要添加：**
- **request 合法域名：** `https://yaoguang.yaoguangxiaoluo.cn`
- **downloadFile 合法域名：** `https://yaoguang.yaoguangxiaoluo.cn`（如果需要下载文件）

### 2. 支付设置配置
**位置：** 抖音开发者后台 -> 支付 -> 支付设置

**需要填写：**
- **URL（服务器地址）：** `https://yaoguang.yaoguangxiaoluo.cn/api/douyin/pay/notify`
- **Token（令牌）：** `jdioaFQWGEQWRHWTEHDFBGHFHYQAWTGDSFHGFHSDBCV`（**必须与后端环境变量 `DOUYIN_PAY_TOKEN` 完全一致**）
- **SALT（盐）：** 点击"眼睛"图标复制，填入 `DOUYIN_PAY_SALT` 环境变量
- **支付方式开关：** 确保"支付宝支付"和"微信支付"都是**开启**状态

⚠️ **重要提醒：** Token 值必须与后端环境变量 `DOUYIN_PAY_TOKEN` 完全一致，否则回调验签会失败！

### 3. 隐私协议配置
**位置：** 抖音开发者后台 -> 设置 -> 隐私设置

**需要操作：**
- 配置用户隐私保护指引
- 确保小程序代码中已实现隐私弹窗（✅ 已完成）

## 🗄️ 数据库迁移

### 必须执行的 SQL

```sql
-- 1. 添加 douyin_openid 字段（如果还没执行）
ALTER TABLE `users` ADD COLUMN `douyin_openid` VARCHAR(64) NULL COMMENT '抖音用户ID' AFTER `openid`;

-- 2. 检查 phone 字段的唯一索引
-- 注意：MySQL 允许唯一索引有多个 NULL 值，所以可以保留唯一索引
SHOW INDEX FROM `users` WHERE Column_name = 'phone';
-- 如果不存在，需要添加：
-- ALTER TABLE `users` ADD UNIQUE KEY `uk_phone` (`phone`);
```

## 🧪 测试检查点

### 登录流程测试
1. ✅ 打开登录页，检查隐私弹窗是否正常显示
2. ✅ 点击"同意并继续"，检查是否显示"手机号一键登录"按钮
3. ✅ 点击"手机号一键登录"，检查是否调用 `tt.login` 刷新 code
4. ✅ 授权手机号后，检查是否成功调用后端登录接口
5. ✅ 登录成功后，检查是否保存 token 并跳转到主页面

### 充值流程测试
1. ✅ iOS 设备：检查是否显示"iOS 暂不支持充值"提示
2. ✅ Android 设备：检查充值入口是否正常显示
3. ✅ 选择套餐后，检查是否调用 `tt.login` 获取 code
4. ✅ 检查是否成功调用后端预下单接口
5. ✅ 检查是否成功调用 `tt.pay` 拉起支付
6. ✅ 支付成功后，检查是否调用查询接口更新积分

### 后端接口测试
1. ✅ `/api/douyin/auth/login` - 登录接口
2. ✅ `/api/douyin/pay/create-order` - 创建订单接口
3. ✅ `/api/douyin/pay/notify` - 支付回调接口（需要抖音服务器调用）
4. ✅ `/api/douyin/pay/query-and-complete` - 查询订单接口

## ⚠️ 常见问题排查

### 1. 登录失败："获取session_key失败"
- **原因：** `DOUYIN_APP_ID` 或 `DOUYIN_APP_SECRET` 配置错误
- **解决：** 检查环境变量是否正确配置

### 2. 支付失败："未配置抖音支付，返回模拟模式"
- **原因：** `DOUYIN_PAY_SALT` 或 `DOUYIN_MERCHANT_ID` 未配置
- **解决：** 检查环境变量是否已设置并重启服务

### 3. 支付回调失败："验签失败"
- **原因：** `DOUYIN_PAY_TOKEN` 与抖音后台配置不一致
- **解决：** 
  - 确保后端环境变量 `DOUYIN_PAY_TOKEN=jdioaFQWGEQWRHWTEHDFBGHFHYQAWTGDSFHGFHSDBCV`
  - 确保抖音后台"支付设置"中的 Token 也填写为 `jdioaFQWGEQWRHWTEHDFBGHFHYQAWTGDSFHGFHSDBCV`
  - **两者必须完全一致**（包括大小写、空格等）

### 4. iOS 设备仍显示充值入口
- **原因：** `tt.getSystemInfoSync()` 可能返回异常
- **解决：** 检查代码中的 iOS 屏蔽逻辑是否正确执行

### 5. 隐私弹窗不显示
- **原因：** 组件未正确注册或 `privacy_agreed` 存储值异常
- **解决：** 检查 `pages/login/index.json` 是否注册了 `privacy-popup` 组件

## 📝 部署步骤

1. **上传后端代码到服务器**
   ```bash
   # 确保所有环境变量已配置
   # 重启 Node.js 服务
   ```

2. **执行数据库迁移**
   ```sql
   -- 执行 add_douyin_openid.sql
   ```

3. **配置抖音开发者后台**
   - 添加服务器域名
   - 配置支付设置（URL、Token、SALT）
   - 配置隐私协议

4. **上传前端代码到抖音开发者工具**
   - 使用"抖音开发者工具"打开 `ttcode` 文件夹
   - 检查 `project.config.json` 中的 `appid` 是否正确
   - 编译并预览

5. **真机测试**
   - 使用 Android 设备测试完整流程
   - 使用 iOS 设备验证屏蔽逻辑

## ✅ 最终检查

- [ ] 所有环境变量已配置
- [ ] 数据库迁移已执行
- [ ] 抖音开发者后台配置完成
- [ ] 前端代码已上传并编译通过
- [ ] 登录流程测试通过
- [ ] 充值流程测试通过（Android）
- [ ] iOS 屏蔽逻辑验证通过
- [ ] 支付回调接口可访问（公网 HTTPS）

---

**配置完成后，即可正常使用抖音小程序！** 🎉

