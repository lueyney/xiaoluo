const logger = require('../utils/logger');

// 错误处理中间件
function errorHandler(err, req, res, next) {
  logger.error('服务器错误:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // 数据库错误
  if (err.code && err.code.startsWith('ER_')) {
    return res.status(500).json({
      error: '数据库操作失败',
      code: 'DATABASE_ERROR',
      message: process.env.NODE_ENV === 'development' ? err.message : '服务器内部错误'
    });
  }

  // 验证错误
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: '请求参数验证失败',
      code: 'VALIDATION_ERROR',
      details: err.details || err.message
    });
  }

  // JWT错误
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: '无效的访问令牌',
      code: 'INVALID_TOKEN'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: '访问令牌已过期',
      code: 'TOKEN_EXPIRED'
    });
  }

  // 默认错误
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || '服务器内部错误';

  res.status(statusCode).json({
    error: message,
    code: err.code || 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

module.exports = errorHandler;
