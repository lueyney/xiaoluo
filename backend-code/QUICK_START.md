# 论文君后端快速启动指南

## 🚀 快速开始

### 1. 安装依赖
```bash
cd backend-code
npm install
```

### 2. 配置环境变量
```bash
# 复制环境配置文件
cp env.example .env

# 编辑 .env 文件，配置数据库连接
# 至少需要修改以下配置：
# DB_PASSWORD=your_mysql_password
```

### 3. 测试数据库连接
```bash
npm run test-db
```

如果连接失败，请检查：
- MySQL服务是否已启动
- 数据库用户名和密码是否正确
- 数据库是否存在

### 4. 初始化数据库
```bash
npm run init-db
```

这将创建所有必要的表、存储过程、触发器和初始数据。

### 5. 启动服务
```bash
# 开发环境（自动重启）
npm run dev

# 生产环境
npm start
```

服务启动后，访问 `http://localhost:3000/health` 检查服务状态。

## 📋 数据库配置检查清单

- [ ] MySQL服务已启动
- [ ] 数据库用户有创建数据库的权限
- [ ] 环境变量配置正确
- [ ] 数据库连接测试通过
- [ ] 数据库初始化完成

## 🔧 常见问题

### 数据库连接失败
1. 检查MySQL服务状态
2. 验证用户名和密码
3. 确认数据库端口（默认3306）

### 权限不足
确保数据库用户有以下权限：
- CREATE DATABASE
- CREATE TABLE
- INSERT, UPDATE, DELETE, SELECT
- CREATE ROUTINE, EXECUTE

### 端口被占用
如果3000端口被占用，可以修改.env文件中的PORT配置。

## 📚 下一步

1. 查看 [API文档](README.md#api文档) 了解接口使用方法
2. 使用快速登录接口测试用户认证
3. 测试AI创作和降重功能
4. 配置微信小程序后端接口地址

## 🆘 需要帮助？

如果遇到问题，请检查：
1. 控制台错误信息
2. 日志文件 `logs/error.log`
3. 数据库连接状态
4. 环境变量配置
