const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

// 数据库连接配置
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'lunjun_app',
  charset: 'utf8mb4',
  timezone: process.env.DB_TIMEZONE || '+08:00',
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_POOL_SIZE, 10) || 10
};

// 创建连接池
const pool = mysql.createPool(dbConfig);

// 测试数据库连接
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    logger.info('数据库连接成功');
    connection.release();
    return true;
  } catch (error) {
    logger.error('数据库连接失败:', error.message);
    return false;
  }
}

// 执行查询的封装函数
async function query(sql, params = []) {
  try {
    const [rows] = await pool.execute(sql, params);
    return rows;
  } catch (error) {
    logger.error('数据库查询错误:', {
      sql,
      params,
      error: error.message
    });
    throw error;
  }
}

// 执行事务的封装函数
async function transaction(callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// 初始化数据库连接
testConnection();

module.exports = {
  pool,
  query,
  transaction,
  testConnection
};
