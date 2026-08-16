const express = require('express');
const { body, query: queryValidator, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const { RECHARGE_PACKAGES } = require('../config/recharge-packages');

const router = express.Router();

router.use(authenticateToken);

router.get('/packages', async (req, res) => {
  try {
    const packages = RECHARGE_PACKAGES
      .slice()
      .sort((a, b) => Number(a.price) - Number(b.price))
      .map((p) => ({
        id: Number(p.id),
        name: p.label,
        credits: Number(p.totalCredits),
        price: Number(p.price),
        description: p.description,
        popular: !!p.popular,
        tag: p.tag || null,
        isFirstRecharge: !!p.isFirstRecharge
      }));

    res.json({ code: 'SUCCESS', data: packages });
  } catch (error) {
    logger.error('获取套餐列表失败:', error.message);
    res.status(500).json({ error: '获取套餐列表失败', code: 'GET_PACKAGES_ERROR' });
  }
});

router.post('/', [
  body('packageId').isInt({ min: 1 }).withMessage('套餐ID必须为正整数'),
  body('paymentMethod').optional().isString()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: '参数验证失败', code: 'VALIDATION_ERROR', details: errors.array() });
  }

  return res.status(410).json({
    error: '请使用 /api/wechat-pay/create-web-order 创建充值订单',
    code: 'DEPRECATED'
  });
});

router.get('/', [
  queryValidator('page').optional().isInt({ min: 1 }).withMessage('页码必须大于等于1'),
  queryValidator('limit').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在1-100之间'),
  queryValidator('status').optional().isIn(['processing', 'completed', 'failed']).withMessage('状态无效')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: '参数验证失败', code: 'VALIDATION_ERROR', details: errors.array() });
    }

    const userId = req.user.id;
    const page = Math.max(parseInt(req.query.page || 1, 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || 20, 10), 1), 100);
    const offset = (page - 1) * limit;
    const status = req.query.status;

    let whereClause = 'WHERE user_id = ?';
    const queryParams = [userId];
    if (status) {
      whereClause += ' AND status = ?';
      queryParams.push(status);
    }

    const countRows = await query(
      `SELECT COUNT(*) AS total FROM orders ${whereClause}`,
      queryParams
    );
    const total = Number((countRows[0] && countRows[0].total) || 0);

    const orders = await query(
      `SELECT id, order_no, type, amount, credits, credits_before, credits_after,
              status, payment_method, finished_at, failure_reason, success_count, fail_count, created_at, updated_at
       FROM orders ${whereClause}
       ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      queryParams
    );

    res.json({
      code: 'SUCCESS',
      data: {
        orders,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('获取订单列表失败:', error.message);
    res.status(500).json({ error: '获取订单列表失败', code: 'GET_ORDERS_ERROR' });
  }
});

router.get('/stats/overview', async (req, res) => {
  try {
    const userId = req.user.id;

    const statusStats = await query(
      `SELECT status, COUNT(*) AS count, SUM(amount) AS total_amount
       FROM orders
       WHERE user_id = ?
       GROUP BY status`,
      [userId]
    );

    const overallRows = await query(
      `SELECT
         COUNT(*) AS total_orders,
         SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) AS total_paid,
         SUM(CASE WHEN status = 'completed' THEN credits ELSE 0 END) AS total_credits
       FROM orders
       WHERE user_id = ?`,
      [userId]
    );

    const recentOrders = await query(
      `SELECT id, order_no, amount, credits, status, created_at
       FROM orders
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 5`,
      [userId]
    );

    res.json({
      code: 'SUCCESS',
      data: {
        statusStats,
        overallStats: overallRows[0] || { total_orders: 0, total_paid: 0, total_credits: 0 },
        recentOrders
      }
    });
  } catch (error) {
    logger.error('获取订单统计失败:', error.message);
    res.status(500).json({ error: '获取订单统计失败', code: 'GET_ORDER_STATS_ERROR' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const orderId = req.params.id;

    const orders = await query(
      `SELECT id, order_no, type, amount, credits, credits_before, credits_after,
              status, payment_method, finished_at, failure_reason, success_count, fail_count, created_at, updated_at
       FROM orders
       WHERE id = ? AND user_id = ?`,
      [orderId, userId]
    );

    if (!orders.length) {
      return res.status(404).json({ error: '订单不存在', code: 'ORDER_NOT_FOUND' });
    }

    res.json({ code: 'SUCCESS', data: orders[0] });
  } catch (error) {
    logger.error('获取订单详情失败:', error.message);
    res.status(500).json({ error: '获取订单详情失败', code: 'GET_ORDER_ERROR' });
  }
});

router.post('/:id/pay', async (req, res) => {
  return res.status(410).json({
    error: '请使用 /api/wechat-pay/create-web-order 发起支付',
    code: 'DEPRECATED'
  });
});

router.post('/:id/cancel', async (req, res) => {
  try {
    const userId = req.user.id;
    const orderId = req.params.id;

    const orders = await query(
      'SELECT id, status FROM orders WHERE id = ? AND user_id = ?',
      [orderId, userId]
    );

    if (!orders.length) {
      return res.status(404).json({ error: '订单不存在', code: 'ORDER_NOT_FOUND' });
    }

    if (orders[0].status !== 'processing') {
      return res.status(400).json({ error: '当前订单状态不允许取消', code: 'INVALID_ORDER_STATUS' });
    }

    await query(
      `UPDATE orders
       SET status = 'failed',
           failure_reason = ?,
           finished_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      ['用户主动取消', orderId]
    );

    res.json({ message: '订单已取消', code: 'SUCCESS' });
  } catch (error) {
    logger.error('取消订单失败:', error.message);
    res.status(500).json({ error: '取消订单失败', code: 'CANCEL_ORDER_ERROR' });
  }
});

module.exports = router;
