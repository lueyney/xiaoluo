/**
 * 幸运转盘路由
 * 实现每日免费抽奖功能
 */

const express = require('express');
const { query, transaction } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// 所有路由都需要认证
router.use(authenticateToken);

// 奖品池配置
const REWARD_POOL = [
  { label: "积分 +20", type: "points", value: 20, desc: "积分增加 20", probability: 30 },
  { label: "积分 +50", type: "points", value: 50, desc: "积分增加 50", probability: 20 },
  { label: "积分 +100", type: "points", value: 100, desc: "积分增加 100", probability: 10 },
  { label: "降重券 x1", type: "coupon", value: 1, desc: "赠送 1 次降重机会", probability: 15 },
  { label: "积分 +80", type: "points", value: 80, desc: "积分增加 80", probability: 15 },
  { label: "再接再厉", type: "none", value: 0, desc: "感谢参与，明天再来", probability: 10 }
];

// 检查今日是否已抽奖
router.get('/check-daily', async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // 查询今日抽奖记录
    const [records] = await query(
      `SELECT COUNT(*) as count FROM lottery_records 
       WHERE user_id = ? AND DATE(created_at) = ?`,
      [userId, today]
    );

    const hasDrawnToday = records.count > 0;
    const remainingChances = hasDrawnToday ? 0 : 1;

    res.json({
      code: 'SUCCESS',
      data: {
        hasDrawnToday,
        remainingChances,
        nextDrawTime: hasDrawnToday ? getNextDayTimestamp() : null
      }
    });

  } catch (error) {
    logger.error('检查抽奖次数失败:', error.message);
    res.status(500).json({
      error: '查询失败',
      code: 'QUERY_ERROR'
    });
  }
});

// 抽奖接口
router.post('/draw', async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    // 检查今日是否已抽奖
    const [records] = await query(
      `SELECT COUNT(*) as count FROM lottery_records 
       WHERE user_id = ? AND DATE(created_at) = ?`,
      [userId, today]
    );

    if (records.count > 0) {
      return res.status(400).json({
        error: '今日已抽奖',
        code: 'ALREADY_DRAWN',
        data: {
          nextDrawTime: getNextDayTimestamp()
        }
      });
    }

    // 根据概率抽取奖品
    const reward = drawReward();
    
    logger.info(`用户 ${userId} 抽奖获得: ${reward.label} (${reward.type}=${reward.value})`);

    // 使用事务处理奖励发放和记录
    await transaction(async (connection) => {
      // 如果是积分奖励，增加积分
      if (reward.type === 'points' && reward.value > 0) {
        await connection.execute(
          'UPDATE user_credits SET credits = credits + ? WHERE user_id = ?',
          [reward.value, userId]
        );

        // 获取新余额
        const [newCredit] = await connection.execute(
          'SELECT credits FROM user_credits WHERE user_id = ?',
          [userId]
        );

        // 记录积分交易
        await connection.execute(
          'INSERT INTO credit_transactions (user_id, type, amount, balance_after, source, description) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, 'earn', reward.value, newCredit[0].credits, 'lottery', `幸运转盘：${reward.label}`]
        );
      }

      // 记录抽奖记录
      await connection.execute(
        `INSERT INTO lottery_records (user_id, reward_type, reward_label, reward_value, reward_desc) 
         VALUES (?, ?, ?, ?, ?)`,
        [userId, reward.type, reward.label, reward.value, reward.desc]
      );

      // 发送通知
      await connection.execute(
        'INSERT INTO notifications (user_id, category, title, content) VALUES (?, ?, ?, ?)',
        [userId, '抽奖提醒', `幸运转盘获得：${reward.label}`, reward.desc]
      );
    });

    res.json({
      code: 'SUCCESS',
      data: {
        reward,
        remainingChances: 0,
        nextDrawTime: getNextDayTimestamp()
      }
    });

  } catch (error) {
    logger.error('抽奖失败:', error.message);
    res.status(500).json({
      error: '抽奖失败',
      code: 'DRAW_ERROR'
    });
  }
});

// 获取抽奖历史
router.get('/history', async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;

    const records = await query(
      `SELECT * FROM lottery_records 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT ?`,
      [userId, limit]
    );

    res.json({
      code: 'SUCCESS',
      data: {
        records
      }
    });

  } catch (error) {
    logger.error('获取抽奖历史失败:', error.message);
    res.status(500).json({
      error: '查询失败',
      code: 'QUERY_ERROR'
    });
  }
});

// 根据概率抽取奖品
function drawReward() {
  const totalProbability = REWARD_POOL.reduce((sum, item) => sum + item.probability, 0);
  let random = Math.random() * totalProbability;
  
  for (const reward of REWARD_POOL) {
    random -= reward.probability;
    if (random <= 0) {
      return reward;
    }
  }
  
  return REWARD_POOL[REWARD_POOL.length - 1]; // fallback
}

// 获取明天0点的时间戳
function getNextDayTimestamp() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.getTime();
}

module.exports = router;

