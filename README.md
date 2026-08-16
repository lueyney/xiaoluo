# 小珞 AI 完整项目

本仓库包含小珞 AI 的用户端、服务端、运营后台与可视化工作流系统。

## 项目组成

- 根目录：微信小程序端
- `ttcode/`：抖音小程序端
- `web-frontend/`：小珞 AI 网页端
- `web-frontend/admin/`：运营管理后台
- `web-frontend/admin/workflows-src/`：React + React Flow 工作流画板源码
- `web-frontend/admin/workflows/`：工作流画板生产构建
- `backend-code/`：Node.js + Express 主服务、AI 写作与降重服务
- `backend-code/services/workflow-studio/`：工作流校验、编译、运行与发布引擎
- `backmager/`：运营后台 API、权限与数据管理服务

## 主要能力

- AI 论文写作、标题生成、论文降重与 DOCX 文档降重
- 文档库、积分、订单、微信支付与抖音支付
- 微信小程序、抖音小程序与网页端共用主后台
- 用户、订单、支付、文档、通知和系统运营管理
- 可视化工作流编排、子工作流、循环、条件分支、调试和发布
- MySQL 数据持久化、JWT 身份认证和管理端权限控制

## 本地启动

### 1. 配置后端

```powershell
Copy-Item backend-code/.env.example backend-code/.env
```

填写 MySQL、JWT、AI 模型、短信和支付等环境变量。真实 `.env`、支付证书和运行数据不会提交到 Git。

### 2. 启动主服务

```powershell
cd backend-code
npm install
npm start
```

默认地址：

- 小珞网页端：`http://localhost:3001/`
- 管理后台：`http://localhost:3001/admin/`
- 工作流画板：`http://localhost:3001/admin/workflows/`
- 主 API：`http://localhost:3001/api/`
- 管理 API：`http://localhost:3001/api/admin/`
- 健康检查：`http://localhost:3001/health`

### 3. 开发工作流画板

```powershell
cd web-frontend/admin/workflows-src
npm install
npm run dev
```

生产构建：

```powershell
npm run build
```

### 4. 小程序

- 微信开发者工具导入仓库根目录。
- 抖音开发者工具导入 `ttcode/`。
- 本地私有项目配置和 `.env` 不会上传。

## 测试

```powershell
cd backend-code
npm test -- --runInBand
```

## 部署

根目录 `Dockerfile` 会安装主后台和运营后台依赖，并由 `backend-code` 同时提供网页静态资源与 API 服务。生产环境需要配置 HTTPS、MySQL、跨域白名单和所有必要环境变量。
