const os = require('os');
const db = require('../config/database');
const adminRepository = require('../repositories/adminRepository');
const { hashPassword } = require('../utils/password');

function getEnvironmentInfo () {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    uptime: process.uptime(),
    memory: {
      total: os.totalmem(),
      free: os.freemem(),
      usage: process.memoryUsage()
    },
    env: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      DB_HOST: process.env.DB_HOST,
      DB_NAME: process.env.DB_NAME,
      ADMIN_CORS_ORIGINS: process.env.ADMIN_CORS_ORIGINS
    }
  };
}

async function getDatabaseControlInfo () {
  const [[databaseInfo]] = await db.pool.query(
    `SELECT DATABASE() AS databaseName,
            VERSION() AS mysqlVersion,
            NOW() AS serverTime`
  );

  const [tableRows] = await db.pool.query(
    `SELECT TABLE_NAME AS tableName,
            TABLE_ROWS AS tableRows,
            ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) AS sizeMb,
            CREATE_TIME AS createTime,
            UPDATE_TIME AS updateTime
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
     ORDER BY TABLE_NAME ASC`
  );

  return {
    database: databaseInfo,
    tables: tableRows
  };
}

async function listAdmins () {
  return adminRepository.listAdmins();
}

async function createAdmin ({ username, displayName, password, role = 'admin' }) {
  const existing = await adminRepository.findByUsernameIncludingDisabled(username);
  if (existing) {
    const error = new Error('管理员账号已存在');
    error.statusCode = 409;
    error.code = 'ADMIN_EXISTS';
    throw error;
  }

  const passwordHash = await hashPassword(password);
  const adminId = await adminRepository.createAdmin({
    username,
    displayName,
    passwordHash,
    role
  });

  return adminRepository.findById(adminId);
}

async function updateAdminStatus (id, status) {
  const admin = await adminRepository.findById(id);
  if (!admin) {
    const error = new Error('管理员不存在');
    error.statusCode = 404;
    error.code = 'ADMIN_NOT_FOUND';
    throw error;
  }

  await adminRepository.updateAdminStatus(id, status);
  return true;
}

module.exports = {
  getEnvironmentInfo,
  getDatabaseControlInfo,
  listAdmins,
  createAdmin,
  updateAdminStatus
};
