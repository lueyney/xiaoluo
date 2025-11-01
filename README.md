# 论文君小程序

AI智能论文写作小程序，支持一键登录、邀请码系统、积分充值等功能。

## 📁 项目结构（前后端分离）

```
2025.9.24/
├── backend-code/          # 后端（Express.js + MySQL）
│   ├── app.js            # Express应用入口
│   ├── routes/           # API路由
│   ├── config/           # 配置文件
│   ├── middleware/       # 中间件
│   ├── utils/            # 工具类
│   └── .env              # 环境变量
│
└── (前端-微信小程序)
    ├── pages/            # 页面
    ├── components/       # 组件
    ├── utils/            # 工具类
    ├── assets/           # 资源文件
    ├── app.js            # 小程序入口
    └── app.json          # 小程序配置
```

---

## 🚀 快速开始

### 后端启动

```bash
cd backend-code
node app.js
```

**配置**:
- 端口: 3000
- 数据库: MySQL
- 环境变量: `.env`文件

### 前端启动

1. 微信开发者工具打开项目根目录
2. 点击"编译"运行

---

## 💰 核心功能

### 1. 一键登录
- 微信手机号授权登录
- 自动注册新用户
- 赠送50积分

### 2. 邀请码系统
- 每用户唯一邀请码
- 微信分享功能
- 双向奖励10积分

### 3. 积分充值
- **首充特惠**: 1元=51积分（赠50）
- 6个充值套餐
- 模拟支付流程

### 4. AI生成
- 7种文档类型
- 积分消耗制
- AI智能创作

---

## 🔧 技术栈

### 后端
- **框架**: Express.js
- **数据库**: MySQL
- **认证**: JWT
- **日志**: Winston
- **API**: RESTful

### 前端
- **框架**: 微信小程序原生
- **语言**: JavaScript + WXML + WXSS

---

## 📊 积分体系

### 获取
- 注册: 50积分
- 邀请奖励: 10积分
- 首次充值1元: 51积分

### 消耗
- 学术论文: 75积分
- 开题报告: 25积分
- 任务书: 20积分

---

## 🔑 配置说明

### 后端环境变量 (backend-code/.env)

```env
# 数据库
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=lunjun_app

# 微信小程序
WECHAT_APP_ID=wxe0548e6755073bfa
WECHAT_APP_SECRET=your_secret

# JWT
JWT_SECRET=your_jwt_secret

# Coze API
COZE_API_KEY=your_coze_key
```

---

## 📝 API接口

### 认证
- POST `/api/auth/login` - 登录
- POST `/api/auth/register` - 注册
- POST `/api/auth/wechat-phone-login` - 一键登录

### 用户
- GET `/api/user/profile` - 获取用户信息
- POST `/api/user/use-invite-code` - 使用邀请码

### 支付
- POST `/api/payment/create-order` - 创建充值订单
- POST `/api/payment/mock-success` - 支付成功回调（模拟）
- GET `/api/payment/order/:orderId` - 查询订单状态

---

## 🎯 测试账号

- 手机号: 13800138000
- 密码: Pass@123
- 初始积分: 100

---

## 📞 联系方式

- 微信小程序: 论文君
- AppID: wxe0548e6755073bfa

---

**开发时间**: 2025年10月  
**版本**: v1.0  
**状态**: ✅ 已完成

