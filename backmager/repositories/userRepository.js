const db = require('../config/database');

async function countUsers ({ keyword, status, startDate, endDate }) {
  const conditions = [];
  const params = [];

  if (keyword) {
    conditions.push('(phone LIKE ? OR nickname LIKE ? OR invite_code LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (typeof status === 'number') {
    conditions.push('status = ?');
    params.push(status);
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

  const rows = await db.query(
    `SELECT COUNT(*) as total FROM users ${where}`,
    params
  );

  return rows[0]?.total || 0;
}

async function listUsers ({ offset, limit, keyword, status, startDate, endDate, sort = 'created_at', order = 'DESC' }) {
  const conditions = [];
  const params = [];

  if (keyword) {
    conditions.push('(phone LIKE ? OR nickname LIKE ? OR invite_code LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (typeof status === 'number') {
    conditions.push('status = ?');
    params.push(status);
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

  const allowedSort = ['created_at', 'updated_at', 'credits'];
  const sortField = allowedSort.includes(sort) ? sort : 'created_at';
  const sortColumn = sortField === 'credits' ? 'c.credits' : `u.${sortField}`;
  const sortOrder = order && order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  params.push(limit, offset);

  return db.query(
    `SELECT u.id, u.phone, u.nickname, u.avatar, u.email, u.status, u.created_at, u.updated_at,
            c.credits, c.total_earned, c.total_consumed
     FROM users u
     LEFT JOIN user_credits c ON c.user_id = u.id
     ${where}
     ORDER BY ${sortColumn} ${sortOrder}
     LIMIT ? OFFSET ?`,
    params
  );
}

async function getUserById (id) {
  const rows = await db.query(
    `SELECT u.*, c.credits, c.total_earned, c.total_consumed
     FROM users u
     LEFT JOIN user_credits c ON c.user_id = u.id
     WHERE u.id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function getUserByIdWithConnection (connection, id) {
  const [rows] = await connection.execute(
    `SELECT u.*, c.credits, c.total_earned, c.total_consumed
     FROM users u
     LEFT JOIN user_credits c ON c.user_id = u.id
     WHERE u.id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function getUserByPhone (phone) {
  const rows = await db.query(
    `SELECT id, phone, nickname
     FROM users
     WHERE phone = ?
     LIMIT 1`,
    [phone]
  );
  return rows[0] || null;
}

async function createUser (connection, { phone, nickname, avatar = null, email = null, status = 1, inviteCode }) {
  const [result] = await connection.execute(
    `INSERT INTO users (phone, nickname, avatar, email, status, invite_code)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [phone, nickname, avatar, email, status, inviteCode]
  );
  return result.insertId;
}

async function updateUser (id, { phone, nickname, avatar, email, status }) {
  const fields = [];
  const params = [];

  if (phone !== undefined) {
    fields.push('phone = ?');
    params.push(phone);
  }
  if (nickname !== undefined) {
    fields.push('nickname = ?');
    params.push(nickname);
  }
  if (avatar !== undefined) {
    fields.push('avatar = ?');
    params.push(avatar);
  }
  if (email !== undefined) {
    fields.push('email = ?');
    params.push(email);
  }
  if (status !== undefined) {
    fields.push('status = ?');
    params.push(status);
  }

  if (!fields.length) {
    return false;
  }

  params.push(id);
  await db.query(
    `UPDATE users
     SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = ?`,
    params
  );
  return true;
}

async function deleteUser (id) {
  await db.query(
    `DELETE FROM users
     WHERE id = ?`,
    [id]
  );
}

async function updateStatus (id, status) {
  await db.query(
    `UPDATE users
     SET status = ?, updated_at = NOW()
     WHERE id = ?`,
    [status, id]
  );
}

async function getUserDocuments (userId, limit = 10) {
  return db.query(
    `SELECT id, title, type, word_count, credits_cost, created_at
     FROM documents
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [userId, limit]
  );
}

async function getCreditTransactions (userId, limit = 20) {
  return db.query(
    `SELECT id, type, amount, balance_after, source, description, created_at
     FROM credit_transactions
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [userId, limit]
  );
}

async function countCreditTransactionsByUser (userId) {
  const rows = await db.query(
    `SELECT COUNT(*) AS total
     FROM credit_transactions
     WHERE user_id = ?`,
    [userId]
  );
  return rows[0]?.total || 0;
}

async function listCreditTransactionsByUser ({ userId, offset, limit }) {
  return db.query(
    `SELECT id, type, amount, balance_after, source, description, created_at
     FROM credit_transactions
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );
}

async function getUserForUpdate (connection, userId) {
  const [rows] = await connection.execute(
    `SELECT id, status, nickname
     FROM users
     WHERE id = ?
     FOR UPDATE`,
    [userId]
  );
  return rows[0] || null;
}

async function getCreditAccountForUpdate (connection, userId) {
  const [rows] = await connection.execute(
    `SELECT id, credits, total_earned, total_consumed
     FROM user_credits
     WHERE user_id = ?
     FOR UPDATE`,
    [userId]
  );
  return rows[0] || null;
}

async function createCreditAccount (connection, userId, credits = 0) {
  await connection.execute(
    `INSERT INTO user_credits (user_id, credits, total_earned, total_consumed)
     VALUES (?, ?, ?, 0)`,
    [userId, credits, credits]
  );
}

async function updateCreditAccount (connection, userId, { credits, totalEarned, totalConsumed }) {
  await connection.execute(
    `UPDATE user_credits
     SET credits = ?, total_earned = ?, total_consumed = ?, updated_at = NOW()
     WHERE user_id = ?`,
    [credits, totalEarned, totalConsumed, userId]
  );
}

async function insertCreditTransaction (connection, { userId, type, amount, balanceAfter, source, sourceId = null, description }) {
  await connection.execute(
    `INSERT INTO credit_transactions (user_id, type, amount, balance_after, source, source_id, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, type, amount, balanceAfter, source, sourceId, description]
  );
}

async function generateUniqueInviteCode (connection, nickname = '') {
  const prefix = (nickname || 'USER').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4) || 'USER';

  while (true) {
    const candidate = `${prefix}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const [rows] = await connection.execute(
      `SELECT id
       FROM users
       WHERE invite_code = ?
       LIMIT 1`,
      [candidate]
    );
    if (!rows.length) {
      return candidate;
    }
  }
}

module.exports = {
  countUsers,
  listUsers,
  getUserById,
  getUserByIdWithConnection,
  getUserByPhone,
  createUser,
  updateUser,
  deleteUser,
  updateStatus,
  getUserDocuments,
  getCreditTransactions,
  countCreditTransactionsByUser,
  listCreditTransactionsByUser,
  getUserForUpdate,
  getCreditAccountForUpdate,
  createCreditAccount,
  updateCreditAccount,
  insertCreditTransaction,
  generateUniqueInviteCode
};
