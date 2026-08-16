const express = require('express');
const { query: queryValidator, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// 所有路由都需要认证
router.use(authenticateToken);

// 获取通知列表
router.get('/', [
  queryValidator('page').optional().isInt({ min: 1 }).withMessage('页码必须是正整数'),
  queryValidator('limit').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在1-100之间'),
  queryValidator('category').optional().isLength({ max: 50 }).withMessage('通知分类不能超过50个字符'),
  queryValidator('unread').optional().isBoolean().withMessage('未读状态必须是布尔值')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: '参数验证失败',
        code: 'VALIDATION_ERROR',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const { page = 1, limit = 20, category, unread } = req.query;

    const offset = (page - 1) * limit;
    let whereClause = 'WHERE user_id = ?';
    let queryParams = [userId];

    if (category) {
      whereClause += ' AND category = ?';
      queryParams.push(category);
    }

    if (unread !== undefined) {
      whereClause += ' AND is_read = ?';
      queryParams.push(unread === 'true' ? 1 : 0);
    }

    // 获取总数
    const [countResult] = await query(
      `SELECT COUNT(*) as total FROM notifications ${whereClause}`,
      queryParams
    );

    // 获取通知列表
    const notifications = await query(
      `SELECT id, category, title, content, is_read, created_at
       FROM notifications ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, parseInt(limit), offset]
    );

    res.json({
      code: 'SUCCESS',
      data: {
        notifications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult.total,
          pages: Math.ceil(countResult.total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('获取通知列表失败:', error.message);
    res.status(500).json({
      error: '获取通知列表失败',
      code: 'GET_NOTIFICATIONS_ERROR'
    });
  }
});

// 获取通知详情
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;

    const notifications = await query(
      `SELECT id, category, title, content, is_read, created_at
       FROM notifications 
       WHERE id = ? AND user_id = ?`,
      [notificationId, userId]
    );

    if (notifications.length === 0) {
      return res.status(404).json({
        error: '通知不存在',
        code: 'NOTIFICATION_NOT_FOUND'
      });
    }

    res.json({
      code: 'SUCCESS',
      data: notifications[0]
    });
  } catch (error) {
    logger.error('获取通知详情失败:', error.message);
    res.status(500).json({
      error: '获取通知详情失败',
      code: 'GET_NOTIFICATION_ERROR'
    });
  }
});

// 标记通知为已读
router.put('/:id/read', async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;

    // 检查通知是否存在
    const notifications = await query(
      'SELECT id FROM notifications WHERE id = ? AND user_id = ?',
      [notificationId, userId]
    );

    if (notifications.length === 0) {
      return res.status(404).json({
        error: '通知不存在',
        code: 'NOTIFICATION_NOT_FOUND'
      });
    }

    // 标记为已读
    await query(
      'UPDATE notifications SET is_read = 1 WHERE id = ?',
      [notificationId]
    );

    res.json({
      message: '通知已标记为已读',
      code: 'SUCCESS'
    });
  } catch (error) {
    logger.error('标记通知已读失败:', error.message);
    res.status(500).json({
      error: '标记通知已读失败',
      code: 'MARK_NOTIFICATION_READ_ERROR'
    });
  }
});

// 标记所有通知为已读
router.put('/read-all', async (req, res) => {
  try {
    const userId = req.user.id;

    await query(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [userId]
    );

    res.json({
      message: '所有通知已标记为已读',
      code: 'SUCCESS'
    });
  } catch (error) {
    logger.error('标记所有通知已读失败:', error.message);
    res.status(500).json({
      error: '标记所有通知已读失败',
      code: 'MARK_ALL_NOTIFICATIONS_READ_ERROR'
    });
  }
});

// 删除通知
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;

    // 检查通知是否存在
    const notifications = await query(
      'SELECT id FROM notifications WHERE id = ? AND user_id = ?',
      [notificationId, userId]
    );

    if (notifications.length === 0) {
      return res.status(404).json({
        error: '通知不存在',
        code: 'NOTIFICATION_NOT_FOUND'
      });
    }

    // 删除通知
    await query(
      'DELETE FROM notifications WHERE id = ?',
      [notificationId]
    );

    res.json({
      message: '通知已删除',
      code: 'SUCCESS'
    });
  } catch (error) {
    logger.error('删除通知失败:', error.message);
    res.status(500).json({
      error: '删除通知失败',
      code: 'DELETE_NOTIFICATION_ERROR'
    });
  }
});

// 获取未读通知数量
router.get('/unread/count', async (req, res) => {
  try {
    const userId = req.user.id;

    const [result] = await query(
      'SELECT COUNT(*) as unread_count FROM notifications WHERE user_id = ? AND is_read = 0',
      [userId]
    );

    res.json({
      code: 'SUCCESS',
      data: {
        unreadCount: result.unread_count
      }
    });
  } catch (error) {
    logger.error('获取未读通知数量失败:', error.message);
    res.status(500).json({
      error: '获取未读通知数量失败',
      code: 'GET_UNREAD_COUNT_ERROR'
    });
  }
});

// 获取通知统计
router.get('/stats/overview', async (req, res) => {
  try {
    const userId = req.user.id;

    // 按分类统计
    const categoryStats = await query(
      `SELECT category, COUNT(*) as count, SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread_count
       FROM notifications 
       WHERE user_id = ? 
       GROUP BY category`,
      [userId]
    );

    // 总体统计
    const [overallStats] = await query(
      `SELECT 
         COUNT(*) as total_notifications,
         SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread_notifications,
         MAX(created_at) as last_notification
       FROM notifications 
       WHERE user_id = ?`,
      [userId]
    );

    // 最近通知
    const recentNotifications = await query(
      `SELECT id, category, title, is_read, created_at
       FROM notifications 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT 5`,
      [userId]
    );

    res.json({
      code: 'SUCCESS',
      data: {
        categoryStats,
        overallStats,
        recentNotifications
      }
    });
  } catch (error) {
    logger.error('获取通知统计失败:', error.message);
    res.status(500).json({
      error: '获取通知统计失败',
      code: 'GET_NOTIFICATION_STATS_ERROR'
    });
  }
});

module.exports = router;
