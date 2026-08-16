const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function createUser() {
  let connection;

  try {
    console.log('尝试创建数据库用户...');

    // 先尝试以root连接（可能需要密码）
    try {
      connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: 'root',
        password: process.env.DB_PASSWORD || '',
        charset: 'utf8mb4',
        multipleStatements: true
      });
      console.log('以root用户连接成功');
    } catch (rootError) {
      console.log('无法以root连接，尝试创建匿名用户...');

      // 尝试创建匿名连接（仅用于创建用户）
      connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: '',
        password: '',
        charset: 'utf8mb4',
        multipleStatements: true
      });
    }

    const dbName = process.env.DB_NAME || 'lunjun_app';
    const dbUser = process.env.DB_USER || 'lunjun_user';
    const dbPassword = process.env.DB_PASSWORD || 'lunjun_password_2025';

    // 创建数据库
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`数据库 ${dbName} 已创建或已存在`);

    // 创建用户
    await connection.query(`CREATE USER IF NOT EXISTS '${dbUser}'@'localhost' IDENTIFIED BY '${dbPassword}'`);
    console.log(`用户 ${dbUser} 已创建`);

    // 授权用户
    await connection.query(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'localhost'`);
    await connection.query('FLUSH PRIVILEGES');
    console.log(`已授权用户 ${dbUser} 对数据库 ${dbName} 的所有权限`);

    // 测试连接
    const testConnection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: dbUser,
      password: dbPassword,
      database: dbName,
      charset: 'utf8mb4'
    });

    console.log('✅ 数据库用户创建和测试连接成功！');
    await testConnection.end();

  } catch (error) {
    console.error('❌ 创建数据库用户失败:', error.message);

    // 如果上面的方法都失败了，提供手动设置说明
    console.log('\n🔧 请手动执行以下SQL命令来设置数据库用户：');
    console.log(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'lunjun_app'}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    console.log(`CREATE USER IF NOT EXISTS '${process.env.DB_USER || 'lunjun_user'}'@'localhost' IDENTIFIED BY '${process.env.DB_PASSWORD || 'lunjun_password_2025'}';`);
    console.log(`GRANT ALL PRIVILEGES ON \`${process.env.DB_NAME || 'lunjun_app'}\`.* TO '${process.env.DB_USER || 'lunjun_user'}'@'localhost';`);
    console.log('FLUSH PRIVILEGES;');

    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

if (require.main === module) {
  createUser();
}

module.exports = createUser;
