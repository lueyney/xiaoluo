const db = require('../config/database');

async function countOrders ({ status, startDate, endDate }) {
  const conditions = [];
  const params = [];

  if (status) {
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
  const rows = await db.query(`SELECT COUNT(*) AS total FROM orders ${where}`, params);
  return rows[0]?.total || 0;
}

async function listOrders ({ offset, limit, status, startDate, endDate, userId }) {
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push('o.status = ?');
    params.push(status);
  }
  if (startDate) {
    conditions.push('o.created_at >= ?');
    params.push(startDate);
  }
  if (endDate) {
    conditions.push('o.created_at <= ?');
    params.push(endDate);
  }
  if (userId) {
    conditions.push('o.user_id = ?');
    params.push(userId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit, offset);

  return db.query(
    `SELECT o.id, o.order_no, o.user_id, u.phone, u.nickname, o.type, o.package_id, o.amount,
            o.credits, o.status, o.payment_method, o.created_at, o.finished_at
     FROM orders o
     JOIN users u ON u.id = o.user_id
     ${where}
     ORDER BY o.created_at DESC
     LIMIT ? OFFSET ?`,
    params
  );
}

async function getOrderById (id) {
  const rows = await db.query(
    `SELECT o.*, u.phone, u.nickname
     FROM orders o
     JOIN users u ON u.id = o.user_id
     WHERE o.id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function getOrderTimeline (orderId) {
  return db.query(
    `SELECT id, type, amount, balance_after, description, created_at
     FROM credit_transactions
     WHERE source = 'order' AND source_id = ?
     ORDER BY created_at ASC`,
    [orderId]
  );
}

module.exports = {
  countOrders,
  listOrders,
  getOrderById,
  getOrderTimeline
};

