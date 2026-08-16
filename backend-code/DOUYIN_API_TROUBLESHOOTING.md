# 抖音接口不存在问题排查指南

## 问题现象
前端显示"接口不存在"或返回 404 错误

## 可能原因及解决方案

### 1. 后端服务未启动或未重启
**检查方法：**
- 访问 `https://yaoguang.yaoguangxiaoluo.cn/health` 查看服务是否运行
- 检查后端日志是否有错误

**解决方案：**
```bash
# 重启后端服务
cd backend-code
npm restart
# 或
pm2 restart app
```

### 2. 路由注册问题
**检查方法：**
查看 `backend-code/app.js` 第 123-124 行，确认路由已注册：
```javascript
app.use('/api/douyin/auth', douyinAuthRoutes);  // 抖音登录路由
app.use('/api/douyin/pay', douyinPayRoutes);  // 抖音支付路由
```

**解决方案：**
- 确认路由文件存在：`routes/douyin-auth.js` 和 `routes/douyin-pay.js`
- 确认路由文件正确导出：`module.exports = router;`
- 重启后端服务

### 3. 前端请求路径错误
**检查方法：**
查看前端代码中的 API 调用路径：
- 登录接口：`/api/douyin/auth/login`
- 创建订单：`/api/douyin/pay/create-order`
- 查询订单：`/api/douyin/pay/query-and-complete`
- 检查首充：`/api/douyin/pay/check-first-recharge`

**解决方案：**
- 确认前端 `apiBaseUrl` 配置正确
- 检查请求路径是否完整（包含 `/api/douyin/...`）

### 4. 网络或域名配置问题
**检查方法：**
- 在抖音开发者后台检查服务器域名配置
- 位置：开发 -> 开发设置 -> 服务器域名
- 需要添加：`https://yaoguang.yaoguangxiaoluo.cn`

**解决方案：**
- 在抖音开发者后台添加 request 合法域名
- 保存并等待生效（可能需要几分钟）

### 5. CORS 跨域问题
**检查方法：**
查看后端日志，是否有 CORS 相关错误

**解决方案：**
检查 `backend-code/app.js` 中的 CORS 配置：
```javascript
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? (origin, callback) => {
        // 小程序请求没有 Origin 头，直接放行
        if (!origin) {
          return callback(null, true);
        }
        // ... 其他配置
      }
    : true,
  credentials: true
};
```

### 6. 路由文件加载失败
**检查方法：**
查看后端启动日志，是否有模块加载错误

**解决方案：**
```bash
# 检查路由文件是否存在
ls -la backend-code/routes/douyin-auth.js
ls -la backend-code/routes/douyin-pay.js

# 检查路由文件语法
node -c backend-code/routes/douyin-auth.js
node -c backend-code/routes/douyin-pay.js
```

### 7. 请求方法不匹配
**检查方法：**
- 登录接口：`POST /api/douyin/auth/login`
- 创建订单：`POST /api/douyin/pay/create-order`
- 查询订单：`POST /api/douyin/pay/query-and-complete`
- 检查首充：`GET /api/douyin/pay/check-first-recharge`

**解决方案：**
确认前端请求方法（GET/POST）与后端路由定义一致

## 快速诊断步骤

1. **检查后端服务状态**
   ```bash
   curl https://yaoguang.yaoguangxiaoluo.cn/health
   ```

2. **测试接口是否可访问**
   ```bash
   # 测试登录接口（需要正确的参数）
   curl -X POST https://yaoguang.yaoguangxiaoluo.cn/api/douyin/auth/login \
     -H "Content-Type: application/json" \
     -d '{"code":"test"}'
   ```

3. **查看后端日志**
   - 检查是否有路由注册的日志
   - 检查是否有 404 错误的日志
   - 查看请求路径是否匹配

4. **检查前端请求**
   - 打开抖音开发者工具的网络面板
   - 查看实际请求的 URL
   - 查看请求方法和参数

## 常见错误信息

### 错误1：`接口不存在` 或 `NOT_FOUND`
- **原因：** 路由未注册或路径不匹配
- **解决：** 检查路由注册和请求路径

### 错误2：`CORS拦截未知来源`
- **原因：** CORS 配置问题
- **解决：** 检查 CORS 配置，小程序请求应该放行

### 错误3：`Cannot GET /api/douyin/...`
- **原因：** 请求方法错误（应该是 POST）
- **解决：** 检查前端请求方法

## 验证清单

- [ ] 后端服务已启动
- [ ] 路由文件存在且正确导出
- [ ] 路由已在 app.js 中注册
- [ ] 前端 apiBaseUrl 配置正确
- [ ] 抖音开发者后台已配置服务器域名
- [ ] 请求方法和路径正确
- [ ] 后端日志无错误信息

## 联系支持

如果以上方法都无法解决问题，请提供：
1. 后端启动日志
2. 前端网络请求详情（URL、方法、参数）
3. 后端错误日志
4. 抖音开发者后台配置截图

