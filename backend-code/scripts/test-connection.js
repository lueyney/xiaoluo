const mysql = require('mysql2/promise');
require('dotenv').config();

async function testConnection() {
  let connection;
  
  try {
    console.log('正在测试数据库连接...');
    console.log('配置信息:');
    console.log(`  主机: ${process.env.DB_HOST || 'localhost'}`);
    console.log(`  端口: ${process.env.DB_PORT || 3306}`);
    console.log(`  用户: ${process.env.DB_USER || 'root'}`);
    console.log(`  数据库: ${process.env.DB_NAME || 'lunjun_app'}`);
    console.log('');

    // 测试连接
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'lunjun_app',
      charset: 'utf8mb4'
    });

    console.log('✅ 数据库连接成功！');

    // 测试查询
    const [rows] = await connection.execute('SELECT 1 as test');
    console.log('✅ 数据库查询测试通过！');

    // 检查表是否存在
    const [tables] = await connection.execute(
      "SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema = ?",
      [process.env.DB_NAME || 'lunjun_app']
    );

    if (tables.length > 0) {
      console.log('✅ 数据库表已存在:');
      tables.forEach(table => {
        console.log(`   - ${table.TABLE_NAME}`);
      });
    } else {
      console.log('⚠️  数据库表不存在，请先运行 npm run init-db 初始化数据库');
    }

    console.log('\n🎉 数据库连接测试完成！');

  } catch (error) {
    console.error('❌ 数据库连接失败:');
    console.error(`   错误代码: ${error.code}`);
    console.error(`   错误信息: ${error.message}`);
    
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\n💡 可能的解决方案:');
      console.error('   1. 检查数据库用户名和密码是否正确');
      console.error('   2. 确认用户有访问指定数据库的权限');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 可能的解决方案:');
      console.error('   1. 检查MySQL服务是否已启动');
      console.error('   2. 检查主机地址和端口是否正确');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.error('\n💡 可能的解决方案:');
      console.error('   1. 数据库不存在，请先创建数据库');
      console.error('   2. 运行 npm run init-db 初始化数据库');
    }
    
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  testConnection();
}

module.exports = testConnection;
