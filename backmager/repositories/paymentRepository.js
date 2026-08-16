const db = require('../config/database');

async function countPaymentOrders ({ status, startDate, endDate }) {
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
  const rows = await db.query(`SELECT COUNT(*) AS total FROM payment_orders ${where}`, params);
  return rows[0]?.total || 0;
}

async function listPaymentOrders ({ offset, limit, status, startDate, endDate, userId }) {
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push('po.status = ?');
    params.push(status);
  }
  if (startDate) {
    conditions.push('po.created_at >= ?');
    params.push(startDate);
  }
  if (endDate) {
    conditions.push('po.created_at <= ?');
    params.push(endDate);
  }
  if (userId) {
    conditions.push('po.user_id = ?');
    params.push(userId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  return db.query(
    `SELECT po.id, po.out_trade_no, po.trade_no, po.user_id, u.phone, u.nickname,
            po.package_id, po.amount, po.credits, po.status, po.created_at, po.paid_at
     FROM payment_orders po
     JOIN users u ON u.id = po.user_id
     ${where}
     ORDER BY po.created_at DESC
     LIMIT ? OFFSET ?`,
    params
  );
}

async function getPaymentByOutTradeNo (outTradeNo) {
  const rows = await db.query(
    `SELECT *
     FROM payment_orders
     WHERE out_trade_no = ?
     LIMIT 1`,
    [outTradeNo]
  );
  return rows[0] || null;
}

module.exports = {
  countPaymentOrders,
  listPaymentOrders,
  getPaymentByOutTradeNo
};

