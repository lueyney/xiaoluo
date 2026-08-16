# 论文君后端API服务

这是论文君微信小程序的后端API服务，提供用户管理、AI创作、文档管理、订单处理等功能。

## 功能特性

- 🔐 用户认证与授权
- 📝 AI智能创作
- 🔄 AI智能降重
- 📚 文档管理
- 💰 积分系统
- 📦 订单管理
- 🔔 通知系统
- 📊 数据统计

## 技术栈

- **Node.js** - 运行环境
- **Express.js** - Web框架
- **MySQL** - 数据库
- **JWT** - 身份认证
- **Winston** - 日志管理

## 快速开始

### 环境要求

- Node.js >= 16.0.0
- MySQL >= 8.0
- npm 或 yarn

### 安装依赖

```bash
cd backend-code
npm install
```

### 环境配置

1. 复制环境配置文件：
```bash
cp env.example .env
```

2. 编辑 `.env` 文件，配置数据库连接信息：
```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=lunjun_app
DB_USER=root
DB_PASSWORD=your_password
```

### 初始化数据库

```bash
# 运行数据库初始化脚本
npm run init-db
```

### 启动服务

```bash
# 开发环境
npm run dev

# 生产环境
npm start
```

服务将在 `http://localhost:3000` 启动

## API文档

### 认证接口

#### 发送验证码
```
POST /api/auth/send-code
Content-Type: application/json

{
  "phone": "13800138000"
}
```

#### 用户登录/注册
```
POST /api/auth/login
Content-Type: application/json

{
  "phone": "13800138000",
  "code": "123456",
  "inviteCode": "LUNJUN123456" // 可选
}
```

#### 快速登录（开发环境）
```
POST /api/auth/quick-login
Content-Type: application/json

{
  "phone": "13800138000",
  "code": "123456"
}
```

### 用户接口

#### 获取用户信息
```
GET /api/user/profile
Authorization: Bearer <token>
```

#### 更新用户信息
```
PUT /api/user/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "nickname": "新昵称",
  "avatar": "https://example.com/avatar.jpg"
}
```

#### 获取积分流水
```
GET /api/user/credits/history?page=1&limit=20&type=earn
Authorization: Bearer <token>
```

### 文档接口

#### 获取文档列表
```
GET /api/documents?page=1&limit=20&type=学术论文&keyword=搜索词
Authorization: Bearer <token>
```

#### 创建文档
```
POST /api/documents
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "文档标题",
  "content": "文档内容",
  "type": "学术论文",
  "field": "计算机科学",
  "creditsCost": 25
}
```

#### 获取文档详情
```
GET /api/documents/:id
Authorization: Bearer <token>
```

#### 更新文档
```
PUT /api/documents/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "新标题",
  "content": "新内容"
}
```

#### 删除文档
```
DELETE /api/documents/:id
Authorization: Bearer <token>
```

### AI接口

#### AI创作
```
POST /api/ai/writing
Authorization: Bearer <token>
Content-Type: application/json

{
  "field": "计算机科学",
  "topic": "人工智能在医疗领域的应用",
  "contentTypes": ["学术论文", "开题报告"],
  "requirements": "详细要求",
  "titleLevel1": "一、罗马数字",
  "titleLevel2": "(一) 中文序号"
}
```

#### AI降重
```
POST /api/ai/rewrite
Authorization: Bearer <token>
Content-Type: application/json

{
  "originalText": "需要降重的文本内容",
  "rewriteLevel": 2,
  "discipline": "计算机科学",
  "language": "中文",
  "platform": "知网"
}
```

#### 获取任务状态
```
GET /api/ai/task/:id
Authorization: Bearer <token>
```

### 订单接口

#### 获取充值包列表
```
GET /api/orders/packages
Authorization: Bearer <token>
```

#### 创建订单
```
POST /api/orders
Authorization: Bearer <token>
Content-Type: application/json

{
  "packageId": 1,
  "paymentMethod": "微信支付"
}
```

#### 支付订单
```
POST /api/orders/:id/pay
Authorization: Bearer <token>
```

#### 获取订单列表
```
GET /api/orders?page=1&limit=20&status=paid
Authorization: Bearer <token>
```

### 通知接口

#### 获取通知列表
```
GET /api/notifications?page=1&limit=20&unread=true
Authorization: Bearer <token>
```

#### 标记通知已读
```
PUT /api/notifications/:id/read
Authorization: Bearer <token>
```

#### 标记所有通知已读
```
PUT /api/notifications/read-all
Authorization: Bearer <token>
```

## 数据库结构

### 主要表

- `users` - 用户表
- `user_credits` - 用户积分表
- `orders` - 订单表
- `documents` - 文档表
- `notifications` - 通知表
- `ai_writing_tasks` - AI创作任务表
- `ai_rewrite_tasks` - AI降重任务表
- `credit_transactions` - 积分流水表
- `credit_packages` - 积分充值包表

### 存储过程

- `sp_register_user` - 用户注册
- `sp_consume_credits` - 消费积分

### 视图

- `user_stats` - 用户统计信息

## 开发说明

### 项目结构

```
backend-code/
├── config/          # 配置文件
├── middleware/       # 中间件
├── routes/          # 路由
├── utils/           # 工具函数
├── scripts/         # 脚本
├── logs/            # 日志文件
├── app.js           # 应用入口
├── package.json     # 依赖配置
└── database_init.sql # 数据库初始化脚本
```

### 日志

日志文件保存在 `logs/` 目录下：
- `error.log` - 错误日志
- `combined.log` - 所有日志

### 错误处理

所有API都遵循统一的错误响应格式：

```json
{
  "error": "错误描述",
  "code": "ERROR_CODE",
  "details": "详细信息（可选）"
}
```

### 认证

使用JWT进行身份认证，在请求头中添加：
```
Authorization: Bearer <token>
```

## 部署

### Docker部署

```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### PM2部署

```bash
npm install -g pm2
pm2 start app.js --name lunjun-backend
pm2 save
pm2 startup
```

## 许可证

MIT License
