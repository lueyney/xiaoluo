const db = require('../config/database');

async function countNotifications ({ userId, category }) {
  const conditions = [];
  const params = [];

  if (userId) {
    conditions.push('user_id = ?');
    params.push(userId);
  }

  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await db.query(`SELECT COUNT(*) AS total FROM notifications ${where}`, params);
  return rows[0]?.total || 0;
}

async function listNotifications ({ offset, limit, userId, category }) {
  const conditions = [];
  const params = [];

  if (userId) {
    conditions.push('n.user_id = ?');
    params.push(userId);
  }

  if (category) {
    conditions.push('n.category = ?');
    params.push(category);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  return db.query(
    `SELECT n.id, n.user_id, u.phone, u.nickname, n.category, n.title, n.content,
            n.is_read, n.created_at
     FROM notifications n
     JOIN users u ON u.id = n.user_id
     ${where}
     ORDER BY n.created_at DESC
     LIMIT ? OFFSET ?`,
    params
  );
}

async function createNotification ({ userId, category, title, content }) {
  await db.query(
    `INSERT INTO notifications (user_id, category, title, content)
     VALUES (?, ?, ?, ?)`,
    [userId, category, title, content]
  );
}

module.exports = {
  countNotifications,
  listNotifications,
  createNotification
};

