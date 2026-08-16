require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'lunjun_user',
      password: process.env.DB_PASSWORD || 'zrx20041217',
      database: process.env.DB_NAME || 'lunjun_db'
    });

    console.log('创建lottery_records表...');
    
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS lottery_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        reward_type VARCHAR(50) NOT NULL,
        reward_label VARCHAR(100) NOT NULL,
        reward_value INT NOT NULL,
        reward_desc VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_date (user_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✅ lottery_records表创建成功');
    
    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error('错误:', err.message);
    process.exit(1);
  }
})();

