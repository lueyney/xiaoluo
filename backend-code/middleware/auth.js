const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const logger = require('../utils/logger');

// JWT认证中间件
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: '访问令牌缺失',
        code: 'MISSING_TOKEN'
      });
    }

    // 验证JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 检查用户是否存在且状态正常
    const users = await query(
      'SELECT id, phone, nickname, status FROM users WHERE id = ? AND status = 1',
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({
        error: '用户不存在或已被禁用',
        code: 'USER_NOT_FOUND'
      });
    }

    // 将用户信息添加到请求对象
    req.user = users[0];
    next();
  } catch (error) {
    logger.error('认证失败:', error.message);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: '无效的访问令牌',
        code: 'INVALID_TOKEN'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: '访问令牌已过期',
        code: 'TOKEN_EXPIRED'
      });
    }

    return res.status(500).json({
      error: '认证服务异常',
      code: 'AUTH_SERVICE_ERROR'
    });
  }
}

// 生成JWT令牌
function generateToken(userId) {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// 验证手机号格式
function validatePhone(phone) {
  const phoneRegex = /^1[3-9]\d{9}$/;
  return phoneRegex.test(phone);
}

// 验证验证码格式
function validateCode(code) {
  const codeRegex = /^\d{6}$/;
  return codeRegex.test(code);
}

module.exports = {
  authenticateToken,
  generateToken,
  validatePhone,
  validateCode
};
