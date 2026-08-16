require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const readline = require('readline');
const { hashPassword } = require('../utils/password');
const db = require('../config/database');

async function prompt (question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer);
  }));
}

async function main () {
  const username = await prompt('Admin username: ');
  const displayName = await prompt('Display name: ');
  const password = await prompt('Password: ');

  const passwordHash = await hashPassword(password);

  await db.query(
    `INSERT INTO admin_users (username, display_name, password_hash, role)
     VALUES (?, ?, ?, 'admin')
     ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), password_hash = VALUES(password_hash)`,
    [username, displayName, passwordHash]
  );

  console.log('Admin account upserted successfully.');
  await db.pool.end();
  process.exit(0);
}

main().catch((error) => {
  console.error('Failed to seed admin user:', error);
  process.exit(1);
});

