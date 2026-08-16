const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { query, transaction } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const verificationStore = require('../utils/verification');

const router = express.Router();

const UNIVERSAL_CODE = process.env.VERIFICATION_MASTER_CODE || '243012';

// 所有路由都需要认证
router.use(authenticateToken);

// 获取用户信息
router.get('/profile', async (req, res) => {
  try {
    const userId = req.user.id;

    // 获取用户基本信息
    const users = await query(
      `SELECT id, phone, email, nickname, avatar, vip_level, vip_expire, invite_code, 
              invited_by, created_at FROM users WHERE id = ?`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        error: '用户不存在',
        code: 'USER_NOT_FOUND'
      });
    }

    // 获取用户积分
    const creditResult = await query(
      'SELECT credits, total_earned, total_consumed FROM user_credits WHERE user_id = ?',
      [userId]
    );

    // 获取统计数据（包含所有订单）
    const [orderStats] = await query(
      'SELECT COUNT(*) as total_orders FROM orders WHERE user_id = ?',
      [userId]
    );
    
    const [completedOrderStats] = await query(
      'SELECT COUNT(*) as completed_orders FROM orders WHERE user_id = ? AND status = "completed"',
      [userId]
    );

    const [docStats] = await query(
      'SELECT COUNT(*) as generated_docs FROM documents WHERE user_id = ? AND is_deleted = 0',
      [userId]
    );

    const [inviteStats] = await query(
      'SELECT COUNT(*) as invited_count FROM users WHERE invited_by = ?',
      [userId]
    );
    
    // 统计通过邀请获得的积分
    const [inviteCredits] = await query(
      'SELECT COALESCE(SUM(amount), 0) as invite_earned FROM credit_transactions WHERE user_id = ? AND source = "invite"',
      [userId]
    );

    const [unreadStats] = await query(
      'SELECT COUNT(*) as unread_notifications FROM notifications WHERE user_id = ? AND is_read = 0',
      [userId]
    );

    // 检查用户是否已使用过邀请码
    const user = users[0];
    const hasUsedInvite = user.invited_by ? true : false;
    
    res.json({
      code: 'SUCCESS',
      data: {
        userInfo: {
          id: user.id,
          phone: user.phone,
          email: user.email,
          nickname: user.nickname,
          avatar: user.avatar,
          vipLevel: user.vip_level,
          vipExpire: user.vip_expire,
          inviteCode: user.invite_code,
          credits: creditResult[0]?.credits || 0,
          registerDate: user.created_at,
          hasUsedInvite: hasUsedInvite
        },
        stats: {
          totalOrders: orderStats.total_orders || 0,
          completedOrders: completedOrderStats.completed_orders || 0,
          generatedDocs: docStats.generated_docs || 0,
          balance: creditResult[0]?.credits || 0,
          invitedCount: inviteStats.invited_count || 0,
          gainedCredits: inviteCredits.invite_earned || 0
        },
        hasUnreadNotification: unreadStats.unread_notifications > 0
      }
    });
  } catch (error) {
    logger.error('获取用户信息失败:', error.message);
    res.status(500).json({
      error: '获取用户信息失败',
      code: 'GET_PROFILE_ERROR'
    });
  }
});

// 绑定邀请码（已注册用户）
router.post('/invite/bind', [
  body('inviteCode').isLength({ min: 6, max: 20 }).withMessage('邀请码格式不正确')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: '参数验证失败', code: 'VALIDATION_ERROR', details: errors.array() });
    }

    const userId = req.user.id;
    const inviteCode = String(req.body.inviteCode || '').trim();

    const users = await query('SELECT id, invited_by, invite_code FROM users WHERE id = ?', [userId]);
    if (!users.length) return res.status(404).json({ error: '用户不存在', code: 'USER_NOT_FOUND' });
    if (users[0].invited_by) return res.status(400).json({ error: '你已填写过邀请码', code: 'INVITE_ALREADY_USED' });

    const inviters = await query('SELECT id FROM users WHERE invite_code = ?', [inviteCode]);
    if (!inviters.length) return res.status(400).json({ error: '邀请码无效', code: 'INVALID_INVITE_CODE' });

    const inviterId = inviters[0].id;
    if (inviterId === userId) return res.status(400).json({ error: '不能填写自己的邀请码', code: 'INVITE_SELF_NOT_ALLOWED' });
    if (String(inviteCode).trim() === String(users[0].invite_code || '').trim()) {
      return res.status(400).json({ error: '不能填写自己的邀请码', code: 'INVITE_SELF_NOT_ALLOWED' });
    }

    let bound = false;
    await transaction(async (conn) => {
      const [upd] = await conn.execute(
        'UPDATE users SET invited_by = ? WHERE id = ? AND invited_by IS NULL',
        [inviterId, userId]
      );
      if (!upd || upd.affectedRows === 0) return;

      await conn.execute(
        'UPDATE user_credits SET credits = credits + 10, total_earned = total_earned + 10 WHERE user_id = ?',
        [userId]
      );
      const [creditRows] = await conn.execute('SELECT credits FROM user_credits WHERE user_id = ?', [userId]);
      const balanceAfter = creditRows[0]?.credits || 0;
      await conn.execute(
        `INSERT INTO credit_transactions (user_id, type, amount, balance_after, source, source_id, description)
         VALUES (?, 'earn', 10, ?, 'invite_reward', ?, '填写邀请码奖励')`,
        [userId, balanceAfter, inviterId]
      );
      bound = true;
    });

    if (!bound) {
      return res.status(400).json({ error: '你已填写过邀请码', code: 'INVITE_ALREADY_USED' });
    }

    res.json({ code: 'SUCCESS', message: '邀请码绑定成功，你获得10积分' });
  } catch (error) {
    logger.error('绑定邀请码失败:', error.message);
    res.status(500).json({ error: '绑定邀请码失败', code: 'BIND_INVITE_ERROR' });
  }
});

// 查询邀请码状态
router.get('/invite/status', async (req, res) => {
  try {
    const userId = req.user.id;
    const users = await query('SELECT invite_code FROM users WHERE id = ?', [userId]);
    if (!users.length) return res.status(404).json({ error: '用户不存在', code: 'USER_NOT_FOUND' });

    const [claimable] = await query(
      `SELECT COUNT(*) AS count
       FROM users u
       WHERE u.invited_by = ?
         AND NOT EXISTS (
           SELECT 1 FROM credit_transactions ct
           WHERE ct.user_id = ? AND ct.source = 'invite_claim' AND ct.source_id = u.id
         )`,
      [userId, userId]
    );

    res.json({
      code: 'SUCCESS',
      data: {
        inviteCode: users[0].invite_code,
        claimableCount: claimable?.count || 0
      }
    });
  } catch (error) {
    logger.error('查询邀请码状态失败:', error.message);
    res.status(500).json({ error: '查询邀请码状态失败', code: 'GET_INVITE_STATUS_ERROR' });
  }
});

// 邀请者领取奖励（每次领取一位被邀请用户，30积分）
router.post('/invite/claim', async (req, res) => {
  try {
    const userId = req.user.id;

    let claimedCredits = 0;
    let balanceAfter = 0;

    await transaction(async (conn) => {
      const [invitedRows] = await conn.execute(
        `SELECT u.id
         FROM users u
         WHERE u.invited_by = ?
           AND NOT EXISTS (
             SELECT 1 FROM credit_transactions ct
             WHERE ct.user_id = ? AND ct.source = 'invite_claim' AND ct.source_id = u.id
           )
         ORDER BY u.created_at ASC
         LIMIT 1`,
        [userId, userId]
      );

      if (!invitedRows.length) return;

      const invitedUserId = invitedRows[0].id;
      claimedCredits = 30;

      await conn.execute(
        'UPDATE user_credits SET credits = credits + 30, total_earned = total_earned + 30 WHERE user_id = ?',
        [userId]
      );

      const [creditRows] = await conn.execute('SELECT credits FROM user_credits WHERE user_id = ?', [userId]);
      balanceAfter = creditRows[0]?.credits || 0;

      await conn.execute(
        `INSERT INTO credit_transactions (user_id, type, amount, balance_after, source, source_id, description)
         VALUES (?, 'earn', 30, ?, 'invite_claim', ?, '邀请好友奖励领取')`,
        [userId, balanceAfter, invitedUserId]
      );
    });

    if (!claimedCredits) {
      return res.json({ code: 'SUCCESS', data: { claimedCount: 0, claimedCredits: 0, balanceAfter: null }, message: '暂无可领取邀请奖励' });
    }

    res.json({
      code: 'SUCCESS',
      data: { claimedCount: 1, claimedCredits, balanceAfter },
      message: '已领取30积分'
    });
  } catch (error) {
    logger.error('领取邀请奖励失败:', error.message);
    res.status(500).json({ error: '领取邀请奖励失败', code: 'CLAIM_INVITE_ERROR' });
  }
});

// 更新用户信息
router.put('/profile', [
  body('nickname')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('昵称长度必须在1-50个字符之间'),
  body('avatar')
    .optional()
    .isURL()
    .withMessage('头像必须是有效的URL'),
  body('email')
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage('邮箱格式不正确')
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
    const { nickname, avatar } = req.body;
    const email = req.body.email !== undefined ? req.body.email : undefined;

    const updateFields = [];
    const updateValues = [];

    if (nickname !== undefined) {
      updateFields.push('nickname = ?');
      updateValues.push(nickname);
    }

    if (avatar !== undefined) {
      updateFields.push('avatar = ?');
      updateValues.push(avatar);
    }

    if (email !== undefined) {
      const trimmedEmail = typeof email === 'string' ? email.trim() : '';
      const normalizedEmail = trimmedEmail ? trimmedEmail.toLowerCase() : null;

      if (normalizedEmail) {
        const existingEmail = await query(
          'SELECT id FROM users WHERE email = ? AND id <> ?',
          [normalizedEmail, userId]
        );
        if (existingEmail.length > 0) {
          return res.status(400).json({
            error: '邮箱已被使用',
            code: 'EMAIL_EXISTS'
          });
        }
      }

      updateFields.push('email = ?');
      updateValues.push(normalizedEmail);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        error: '没有需要更新的字段',
        code: 'NO_UPDATE_FIELDS'
      });
    }

    updateValues.push(userId);

    await query(
      `UPDATE users SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      updateValues
    );

    res.json({
      message: '用户信息更新成功',
      code: 'SUCCESS'
    });
  } catch (error) {
    logger.error('更新用户信息失败:', error.message);
    res.status(500).json({
      error: '更新用户信息失败',
      code: 'UPDATE_PROFILE_ERROR'
    });
  }
});

router.post('/avatar', [
  body('image')
    .isString()
    .withMessage('请提供头像数据')
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
    const { image } = req.body;

    const match = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/.exec(image || '');
    if (!match) {
      return res.status(400).json({
        error: '头像数据格式不正确',
        code: 'INVALID_IMAGE'
      });
    }

    const mimeType = match[1];
    const format = match[2] === 'jpg' ? 'jpeg' : match[2];
    const base64Data = match[3];
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length > 2 * 1024 * 1024) {
      return res.status(400).json({
        error: '头像文件不能超过2MB',
        code: 'IMAGE_TOO_LARGE'
      });
    }

    const avatarsDir = path.join(__dirname, '..', 'exports', 'avatars');
    await fs.promises.mkdir(avatarsDir, { recursive: true });

    const fileName = `avatar_${userId}_${Date.now()}.${format}`;
    const filePath = path.join(avatarsDir, fileName);
    await fs.promises.writeFile(filePath, buffer);

    const baseUrl = (process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL.trim())
      ? process.env.PUBLIC_BASE_URL.trim().replace(/\/$/, '')
      : `${req.protocol}://${req.get('host')}`;
    const publicUrl = `${baseUrl}/static/avatars/${fileName}`;

    await query(
      'UPDATE users SET avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [publicUrl, userId]
    );

    res.json({
      code: 'SUCCESS',
      message: '头像更新成功',
      data: {
        url: publicUrl,
        mimeType
      }
    });
  } catch (error) {
    logger.error('更新头像失败:', error.message);
    res.status(500).json({
      error: '更新头像失败',
      code: 'UPDATE_AVATAR_ERROR'
    });
  }
});

router.post('/change-password', [
  body('code')
    .notEmpty()
    .withMessage('请输入短信验证码'),
  body('newPassword')
    .isLength({ min: 6, max: 32 })
    .withMessage('密码长度需在6-32位之间')
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
    const { code, newPassword } = req.body;

    const users = await query(
      'SELECT phone FROM users WHERE id = ? AND status = 1',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        error: '用户不存在或已被禁用',
        code: 'USER_NOT_FOUND'
      });
    }

    const phone = users[0].phone;
    if (!phone) {
      return res.status(400).json({
        error: '账号未绑定手机号，无法通过短信重置',
        code: 'PHONE_REQUIRED'
      });
    }

    const storedCode = verificationStore.getCode(phone);
    const isMasterCode = code === UNIVERSAL_CODE;

    if (!isMasterCode) {
      if (!verificationStore.isValid(storedCode, code, UNIVERSAL_CODE)) {
        return res.status(400).json({
          error: '验证码错误或已过期',
          code: 'INVALID_CODE'
        });
      }
      verificationStore.clearCode(phone);
    } else {
      logger.warn(`修改密码使用万能验证码，手机号: ${phone}`);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await query(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [passwordHash, userId]
    );

    res.json({
      code: 'SUCCESS',
      message: '密码已更新，请使用新密码登录'
    });
  } catch (error) {
    logger.error('修改密码失败:', error.message);
    res.status(500).json({
      error: '修改密码失败',
      code: 'CHANGE_PASSWORD_ERROR'
    });
  }
});

// 获取积分流水
router.get('/credits/history', async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, type } = req.query;

    const offset = (page - 1) * limit;
    let whereClause = 'WHERE user_id = ?';
    let queryParams = [userId];

    if (type && ['earn', 'consume'].includes(type)) {
      whereClause += ' AND type = ?';
      queryParams.push(type);
    }

    // 获取总数
    const [countResult] = await query(
      `SELECT COUNT(*) as total FROM credit_transactions ${whereClause}`,
      queryParams
    );

    // 获取流水记录
    const limitNum = parseInt(limit);
    const offsetNum = parseInt(offset);
    
    const transactions = await query(
      `SELECT id, type, amount, balance_after, source, description, created_at 
       FROM credit_transactions ${whereClause} 
       ORDER BY created_at DESC 
       LIMIT ${limitNum} OFFSET ${offsetNum}`,
      queryParams
    );

    res.json({
      code: 'SUCCESS',
      data: {
        transactions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult.total,
          pages: Math.ceil(countResult.total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('获取积分流水失败:', error.message);
    res.status(500).json({
      error: '获取积分流水失败',
      code: 'GET_CREDITS_HISTORY_ERROR'
    });
  }
});

// 获取邀请统计
router.get('/invite/stats', async (req, res) => {
  try {
    const userId = req.user.id;

    // 获取邀请的用户列表
    const invitedUsers = await query(
      `SELECT id, phone, nickname, created_at 
       FROM users 
       WHERE invited_by = ? 
       ORDER BY created_at DESC`,
      [userId]
    );

    // 获取邀请奖励统计
    const [rewardStats] = await query(
      `SELECT COUNT(*) as total_invites, SUM(amount) as total_rewards 
       FROM credit_transactions 
       WHERE user_id = ? AND source = 'invite'`,
      [userId]
    );

    res.json({
      code: 'SUCCESS',
      data: {
        invitedUsers,
        stats: {
          totalInvites: rewardStats.total_invites,
          totalRewards: rewardStats.total_rewards || 0
        }
      }
    });
  } catch (error) {
    logger.error('获取邀请统计失败:', error.message);
    res.status(500).json({
      error: '获取邀请统计失败',
      code: 'GET_INVITE_STATS_ERROR'
    });
  }
});

// 消耗积分
router.post('/credits/consume', [
  body('amount')
    .isInt({ min: 1 })
    .withMessage('消耗积分必须是大于0的整数'),
  body('source')
    .optional()
    .isString()
    .withMessage('来源必须是字符串'),
  body('description')
    .optional()
    .isString()
    .withMessage('描述必须是字符串')
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
    const { amount, source = 'consume', description = '积分消费' } = req.body;

    await transaction(async (connection) => {
      // 获取当前积分
      const [creditResult] = await connection.execute(
        'SELECT credits FROM user_credits WHERE user_id = ? FOR UPDATE',
        [userId]
      );

      if (!creditResult || creditResult.length === 0) {
        throw new Error('用户积分记录不存在');
      }

      const currentCredits = creditResult[0].credits;

      // 检查积分是否足够
      if (currentCredits < amount) {
        throw new Error('积分不足');
      }

      // 扣减积分
      await connection.execute(
        'UPDATE user_credits SET credits = credits - ?, total_consumed = total_consumed + ? WHERE user_id = ?',
        [amount, amount, userId]
      );

      const newBalance = currentCredits - amount;

      // 记录积分交易
      await connection.execute(
        `INSERT INTO credit_transactions 
         (user_id, type, amount, balance_after, source, description) 
         VALUES (?, 'consume', ?, ?, ?, ?)`,
        [userId, amount, newBalance, source, description]
      );

      res.json({
        code: 'SUCCESS',
        message: '积分消耗成功',
        data: {
          consumed: amount,
          remaining: newBalance
        }
      });
    });
  } catch (error) {
    logger.error('消耗积分失败:', error.message);
    
    if (error.message === '积分不足') {
      return res.status(400).json({
        error: '积分不足',
        code: 'INSUFFICIENT_CREDITS'
      });
    }
    
    res.status(500).json({
      error: '消耗积分失败',
      code: 'CONSUME_CREDITS_ERROR'
    });
  }
});

// 增加积分
router.post('/credits/add', [
  body('amount')
    .isInt({ min: 1 })
    .withMessage('增加积分必须是大于0的整数'),
  body('source')
    .optional()
    .isString()
    .withMessage('来源必须是字符串'),
  body('description')
    .optional()
    .isString()
    .withMessage('描述必须是字符串')
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
    const { amount, source = 'earn', description = '积分获得' } = req.body;

    await transaction(async (connection) => {
      // 增加积分
      await connection.execute(
        'UPDATE user_credits SET credits = credits + ?, total_earned = total_earned + ? WHERE user_id = ?',
        [amount, amount, userId]
      );

      // 获取新余额
      const [creditResult] = await connection.execute(
        'SELECT credits FROM user_credits WHERE user_id = ?',
        [userId]
      );

      const newBalance = creditResult[0].credits;

      // 记录积分交易
      await connection.execute(
        `INSERT INTO credit_transactions 
         (user_id, type, amount, balance_after, source, description) 
         VALUES (?, 'earn', ?, ?, ?, ?)`,
        [userId, amount, newBalance, source, description]
      );

      res.json({
        code: 'SUCCESS',
        message: '积分增加成功',
        data: {
          added: amount,
          remaining: newBalance
        }
      });
    });
  } catch (error) {
    logger.error('增加积分失败:', error.message);
    res.status(500).json({
      error: '增加积分失败',
      code: 'ADD_CREDITS_ERROR'
    });
  }
});

// 使用邀请码（已注册用户）
router.post('/use-invite-code', [
  body('inviteCode').notEmpty().withMessage('请输入邀请码')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: '参数验证失败',
        code: 'VALIDATION_ERROR',
        message: '请输入邀请码'
      });
    }

    const userId = req.user.id;
    const { inviteCode } = req.body;

    // 检查当前用户是否已使用过邀请码
    const [currentUser] = await query(
      'SELECT invited_by, invite_code FROM users WHERE id = ?',
      [userId]
    );

    if (currentUser.invited_by) {
      return res.status(400).json({
        error: '您已经使用过邀请码',
        code: 'ALREADY_USED',
        message: '每个用户只能使用一次邀请码'
      });
    }
    
    // 不能使用自己的邀请码
    if (inviteCode === currentUser.invite_code) {
      return res.status(400).json({
        error: '不能使用自己的邀请码',
        code: 'SELF_INVITE',
        message: '不能使用自己的邀请码'
      });
    }

    // 查找邀请人
    const inviterUsers = await query(
      'SELECT id FROM users WHERE invite_code = ?',
      [inviteCode]
    );

    if (inviterUsers.length === 0) {
      return res.status(400).json({
        error: '邀请码无效',
        code: 'INVALID_CODE',
        message: '邀请码不存在'
      });
    }

    const inviterId = inviterUsers[0].id;

    // 使用事务处理邀请奖励
    await transaction(async (conn) => {
      // 1. 更新当前用户的invited_by
      await conn.execute(
        'UPDATE users SET invited_by = ? WHERE id = ?',
        [inviterId, userId]
      );

      // 2. 给当前用户 +10积分
      await conn.execute(
        'UPDATE user_credits SET credits = credits + 10, total_earned = total_earned + 10 WHERE user_id = ?',
        [userId]
      );

      const [userCredits] = await conn.execute(
        'SELECT credits FROM user_credits WHERE user_id = ?',
        [userId]
      );

      await conn.execute(
        `INSERT INTO credit_transactions (user_id, type, amount, balance_after, source, description, created_at)
         VALUES (?, 'earn', 10, ?, 'invite_reward', '使用邀请码奖励', NOW())`,
        [userId, userCredits[0].credits]
      );

      // 3. 给邀请人 +10积分
      await conn.execute(
        'UPDATE user_credits SET credits = credits + 10, total_earned = total_earned + 10 WHERE user_id = ?',
        [inviterId]
      );

      const [inviterCredits] = await conn.execute(
        'SELECT credits FROM user_credits WHERE user_id = ?',
        [inviterId]
      );

      await conn.execute(
        `INSERT INTO credit_transactions (user_id, type, amount, balance_after, source, description, created_at)
         VALUES (?, 'earn', 10, ?, 'invite', '邀请好友奖励', NOW())`,
        [inviterId, inviterCredits[0].credits]
      );
    });

    logger.info(`用户${userId}使用邀请码${inviteCode}，邀请人${inviterId}和用户各获得10积分`);

    res.json({
      code: 'SUCCESS',
      message: '邀请码使用成功，双方各获得10积分',
      data: {
        reward: 10
      }
    });

  } catch (error) {
    logger.error('使用邀请码失败:', error.message);
    res.status(500).json({
      error: '使用邀请码失败',
      code: 'USE_INVITE_ERROR',
      message: '服务器错误，请稍后重试'
    });
  }
});

module.exports = router;
