const createError = require('http-errors');
const authService = require('../services/authService');

function extractToken (req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  if (req.cookies && req.cookies.admin_token) {
    return req.cookies.admin_token;
  }
  return null;
}

module.exports = function requireAdmin (roles = []) {
  return async (req, res, next) => {
    try {
      const token = extractToken(req);
      if (!token) {
        throw createError(401, '未授权，缺少令牌', { code: 'TOKEN_MISSING' });
      }

      const admin = await authService.verifyToken(token);

      if (roles.length && !roles.includes(admin.role)) {
        throw createError(403, '无访问权限', { code: 'FORBIDDEN' });
      }

      req.admin = admin;
      next();
    } catch (error) {
      next(error);
    }
  };
};

