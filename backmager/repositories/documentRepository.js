const db = require('../config/database');

async function countDocuments ({ type, keyword, startDate, endDate }) {
  const conditions = [];
  const params = [];

  if (type) {
    conditions.push('type = ?');
    params.push(type);
  }
  if (keyword) {
    conditions.push('(title LIKE ? OR field LIKE ? OR content LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (startDate) {
    conditions.push('created_at >= ?');
    params.push(startDate);
  }
  if (endDate) {
    conditions.push('created_at <= ?');
    params.push(endDate);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await db.query(`SELECT COUNT(*) AS total FROM documents ${where}`, params);
  return rows[0]?.total || 0;
}

async function listDocuments ({ offset, limit, type, keyword, startDate, endDate }) {
  const conditions = [];
  const params = [];

  if (type) {
    conditions.push('d.type = ?');
    params.push(type);
  }
  if (keyword) {
    conditions.push('(d.title LIKE ? OR d.field LIKE ? OR u.nickname LIKE ? OR u.phone LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (startDate) {
    conditions.push('d.created_at >= ?');
    params.push(startDate);
  }
  if (endDate) {
    conditions.push('d.created_at <= ?');
    params.push(endDate);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit, offset);

  return db.query(
    `SELECT d.id, d.title, d.type, d.field, d.word_count, d.credits_cost,
            d.created_at, d.updated_at, u.id AS user_id, u.phone, u.nickname
     FROM documents d
     JOIN users u ON u.id = d.user_id
     ${where}
     ORDER BY d.created_at DESC
     LIMIT ? OFFSET ?`,
    params
  );
}

async function getDocumentById (id) {
  const rows = await db.query(
    `SELECT d.*, u.phone, u.nickname
     FROM documents d
     JOIN users u ON u.id = d.user_id
     WHERE d.id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

module.exports = {
  countDocuments,
  listDocuments,
  getDocumentById
};

