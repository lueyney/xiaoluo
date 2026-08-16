const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'lunjun_app',
  charset: 'utf8mb4',
  timezone: process.env.DB_TIMEZONE || '+08:00',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10)
});

async function testConnection () {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
    logger.info('Admin DB connection established');
  } finally {
    connection.release();
  }
}

async function query (sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function transaction (callback) {
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

testConnection().catch((error) => {
  logger.error('Admin DB connection failed', { error: error.message });
});

module.exports = {
  pool,
  query,
  transaction
};

