const createError = require('http-errors');
const adminRepository = require('../repositories/adminRepository');
const { comparePassword } = require('../utils/password');
const tokenUtil = require('../utils/token');
const logger = require('../utils/logger');

async function login (username, password) {
  const admin = await adminRepository.findByUsername(username);

  if (!admin) {
    throw createError(401, '账号或密码错误', { code: 'INVALID_CREDENTIALS' });
  }

  const valid = await comparePassword(password, admin.password_hash);

  if (!valid) {
    throw createError(401, '账号或密码错误', { code: 'INVALID_CREDENTIALS' });
  }

  await adminRepository.updateLastLogin(admin.id);

  const payload = {
    id: admin.id,
    username: admin.username,
    displayName: admin.display_name,
    role: admin.role || 'admin'
  };

  const token = tokenUtil.signToken(payload);
  logger.info('Admin login success', { adminId: admin.id, username: admin.username });

  return { token, admin: payload };
}

async function verifyToken (token) {
  try {
    const decoded = tokenUtil.verifyToken(token);
    const admin = await adminRepository.findById(decoded.id);
    if (!admin || admin.status !== 1) {
      throw createError(401, '管理员已禁用或不存在', { code: 'ADMIN_DISABLED' });
    }
    return {
      id: admin.id,
      username: admin.username,
      displayName: admin.display_name,
      role: admin.role
    };
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      throw createError(401, '令牌已失效，请重新登录', { code: 'TOKEN_INVALID' });
    }
    throw error;
  }
}

async function listAdmins () {
  return adminRepository.listAdmins();
}

module.exports = {
  login,
  verifyToken,
  listAdmins
};

