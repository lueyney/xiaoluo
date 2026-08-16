const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

function splitStatements(sql) {
  const statements = [];
  let current = '';
  let delimiter = ';';
  const lines = sql.split(/\r?\n/);

  for (let rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('--')) {
      current += rawLine + '\n';
      continue;
    }

    const delimiterMatch = line.match(/^DELIMITER\s+(\S+)/i);
    if (delimiterMatch) {
      delimiter = delimiterMatch[1];
      continue;
    }

    current += rawLine + '\n';

    const check = current.trimEnd();
    if (check.endsWith(delimiter)) {
      const statement = check.slice(0, -delimiter.length).trim();
      if (statement) {
        statements.push(statement);
      }
      current = '';
    }
  }

  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements;
}

async function initDatabase() {
  let connection;
  
  try {
    console.log('开始初始化数据库...');
    
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      charset: 'utf8mb4',
      multipleStatements: true
    });

    console.log('MySQL连接成功');

    const dbName = process.env.DB_NAME || 'lunjun_app';
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.query(`USE \`${dbName}\``);

    const sqlPath = path.join(__dirname, '..', 'database_init.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    const statements = splitStatements(sqlContent);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (!statement) {
        continue;
      }
      try {
        console.log(`执行SQL语句 ${i + 1}/${statements.length}...`);
        await connection.query(statement);
      } catch (error) {
        console.warn(`SQL语句执行警告: ${error.message}`);
      }
    }

    console.log('数据库初始化完成！');
    console.log(`数据库名称: ${dbName}`);
    console.log('已创建的表:');

    const [tables] = await connection.query(
      'SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema = ?',
      [dbName]
    );
    
    tables.forEach(table => {
      console.log(`  - ${table.TABLE_NAME}`);
    });

    console.log('\n初始化数据已插入:');
    console.log('  - 积分充值包数据');
    console.log('  - 存储过程和触发器');
    console.log('  - 数据库视图');

  } catch (error) {
    console.error('数据库初始化失败:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

if (require.main === module) {
  initDatabase();
}

module.exports = initDatabase;
