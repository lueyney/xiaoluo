const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, transaction } = require('../config/database');
const { generateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const { code2Session, decryptData } = require('../utils/douyin');

const router = express.Router();

/**
 * 将来源账户（sourceId）数据合并到目标账户（targetId）
 * 场景：无手机号临时账号在补手机号时需要归并到同手机号账号
 */
async function mergeUserData({ sourceId, targetId, douyinOpenid }) {
  if (!sourceId || !targetId || sourceId === targetId) {
    return { merged: false };
  }

  await transaction(async (conn) => {
    // 1) 合并积分
    const [[sourceCredits], [targetCredits]] = await Promise.all([
      conn.execute('SELECT credits, total_earned, total_consumed FROM user_credits WHERE user_id = ?', [sourceId]).then(r => r[0] || [{}]),
      conn.execute('SELECT credits, total_earned, total_consumed FROM user_credits WHERE user_id = ?', [targetId]).then(r => r[0] || [{}])
    ]);

    const mergedCredits = (targetCredits?.credits || 0) + (sourceCredits?.credits || 0);
    const mergedTotalEarned = (targetCredits?.total_earned || 0) + (sourceCredits?.total_earned || 0);
    const mergedTotalConsumed = (targetCredits?.total_consumed || 0) + (sourceCredits?.total_consumed || 0);

    await conn.execute(
      'UPDATE user_credits SET credits = ?, total_earned = ?, total_consumed = ? WHERE user_id = ?',
      [mergedCredits, mergedTotalEarned, mergedTotalConsumed, targetId]
    );

    // 2) 迁移业务数据（保持 referential integrity）
    const tablesToUpdate = [
      'orders',
      'payment_orders',
      'credit_transactions',
      'documents',
      'notifications',
      'ai_writing_tasks',
      'ai_rewrite_tasks'
    ];
    for (const table of tablesToUpdate) {
      await conn.execute(`UPDATE ${table} SET user_id = ? WHERE user_id = ?`, [targetId, sourceId]);
    }

    // 3) 删除来源用户积分记录（外键已迁移）
    await conn.execute('DELETE FROM user_credits WHERE user_id = ?', [sourceId]);

    // 4) 删除来源用户
    await conn.execute('DELETE FROM users WHERE id = ?', [sourceId]);

    // 5) 补写抖音 openid 到目标用户
    if (douyinOpenid) {
      await conn.execute(
        'UPDATE users SET douyin_openid = ?, last_login = NOW() WHERE id = ?',
        [douyinOpenid, targetId]
      );
    }
  });

  logger.info(`抖音登录: 账户合并完成，source=${sourceId} -> target=${targetId}, douyin_openid=${douyinOpenid || 'unchanged'}`);
  return { merged: true };
}

/**
 * 获取用户完整信息（复用微信逻辑）
 */
async function fetchUserProfile(userId) {
  const users = await query(
    `SELECT id, phone, email, nickname, avatar, vip_level, vip_expire, invite_code, password_hash 
     FROM users WHERE id = ? AND status = 1`,
    [userId]
  );
  if (users.length === 0) {
    return null;
  }
  const [creditResult] = await query(
    'SELECT credits FROM user_credits WHERE user_id = ?',
    [userId]
  );
  const user = users[0];
  const passwordSet = !!user.password_hash;

  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    nickname: user.nickname,
    avatar: user.avatar,
    vipLevel: user.vip_level,
    vipExpire: user.vip_expire,
    inviteCode: user.invite_code,
    credits: creditResult?.credits || creditResult?.[0]?.credits || 0,
    passwordSet
  };
}

function sanitizeUserProfile(profile) {
  if (!profile) {
    return profile;
  }
  const { passwordSet, ...rest } = profile;
  return rest;
}

/**
 * 抖音手机号一键登录
 * POST /api/douyin/auth/login
 */
router.post('/login', [
  body('code').notEmpty().withMessage('缺少code'),
  body('anonymousCode').optional().isString().withMessage('anonymousCode必须是字符串')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: '参数验证失败',
        code: 'VALIDATION_ERROR',
        message: '缺少必要参数',
        details: errors.array()
      });
    }

    const { code: douyinCode, anonymousCode, encryptedData, iv } = req.body;
    let phone = null;
    let douyinOpenid = null;
    
    // 方式1：使用 encryptedData 和 iv 解密（新版组件方式）
    if (encryptedData && iv) {
      logger.info('抖音登录: 使用解密方式获取手机号');
      
      // 获取 session_key 和 openid
      const session = await code2Session(douyinCode);
      if (!session || !session.sessionKey) {
        logger.error('抖音登录失败: 无法获取 session_key');
        return res.status(400).json({
          error: '获取session_key失败',
          code: 'SESSION_ERROR',
          message: '登录失败，请重试'
        });
      }
      
      douyinOpenid = session.openid;
      
      // 解密手机号
      const decrypted = decryptData(encryptedData, iv, session.sessionKey);
      if (!decrypted) {
        logger.error('抖音登录失败: 解密手机号失败 - 解密返回null');
        return res.status(400).json({
          error: '解密手机号失败',
          code: 'DECRYPT_ERROR',
          message: '无法获取您的手机号，请重试'
        });
      }
      
      logger.info('抖音解密后的数据:', JSON.stringify(decrypted));
      
      // 兼容不同的字段名：purePhoneNumber（微信格式）或 phoneNumber（抖音可能格式）
      phone = decrypted.purePhoneNumber || decrypted.phoneNumber || decrypted.phone;
      
      // 如果 phoneNumber 带区号，提取纯手机号
      if (!phone && decrypted.phoneNumber) {
        // phoneNumber 可能是 "+8613812345678" 格式，需要提取后11位
        const match = decrypted.phoneNumber.match(/(\d{11})$/);
        if (match) {
          phone = match[1];
        }
      }
      
      if (!phone) {
        logger.error('抖音登录失败: 解密后未找到手机号字段', JSON.stringify(decrypted));
        return res.status(400).json({
          error: '解密手机号失败',
          code: 'DECRYPT_ERROR',
          message: '无法获取您的手机号，请重试'
        });
      }
      
      logger.info(`抖音登录: 解密得到手机号 ${phone}, openid: ${douyinOpenid}`);
    } 
    // 方式2：仅使用 code 获取 openid（不获取手机号，需要用户手动输入手机号）
    else {
      logger.info('抖音登录: 仅获取 openid');
      const session = await code2Session(douyinCode);
      
      if (!session || !session.openid) {
        logger.error('抖音登录失败: 无法获取 openid');
        return res.status(400).json({
          error: '获取openid失败',
          code: 'DOUYIN_ERROR',
          message: '登录失败，请重试'
        });
      }
      
      douyinOpenid = session.openid;
      logger.info(`抖音登录: 获取到 openid: ${douyinOpenid}`);
      
      // 如果没有手机号，需要用户手动输入或绑定
      // 这里先查询是否有已绑定该 openid 的用户
      const existingUsers = await query(
        'SELECT id, phone FROM users WHERE douyin_openid = ?',
        [douyinOpenid]
      );
      
      if (existingUsers.length > 0) {
        // 已绑定用户，直接登录
        const user = existingUsers[0];
        phone = user.phone;
        logger.info(`抖音登录: 找到已绑定用户，手机号: ${phone}`);
      } else {
        // 新用户，需要绑定手机号
        return res.status(200).json({
          code: 'NEED_PHONE',
          message: '需要绑定手机号',
          data: {
            openid: douyinOpenid,
            needBindPhone: true
          }
        });
      }
    }
    
    if (!phone) {
      return res.status(400).json({
        error: '获取手机号失败',
        code: 'PHONE_ERROR',
        message: '无法获取手机号，请使用手机号登录'
      });
    }
    
    // 查询用户：手机号主锚 + openid 兜底 + 合并临时账户
    let userId;
    let isNewUser = false;

    // 先查手机号主账号
    const usersByPhone = await query(
      'SELECT id, phone, nickname, avatar, status, douyin_openid FROM users WHERE phone = ?',
      [phone]
    );

    // 再查当前 openid 归属
    let userByOpenid = null;
    if (douyinOpenid) {
      const openidRows = await query(
        'SELECT id, phone, status FROM users WHERE douyin_openid = ?',
        [douyinOpenid]
      );
      if (openidRows.length > 0) {
        userByOpenid = openidRows[0];
      }
    }

    // 情况A：手机号存在
    if (usersByPhone.length > 0) {
      const phoneUser = usersByPhone[0];
      if (phoneUser.status !== 1) {
        logger.warn(`抖音登录失败: 账号已被禁用 ${phone}`);
        return res.status(403).json({
          error: '账号已被禁用',
          code: 'ACCOUNT_DISABLED',
          message: '您的账号已被禁用，请联系客服'
        });
      }

      userId = phoneUser.id;

      // 如果 openid 绑定在另一个临时账号，需要合并
      if (userByOpenid && userByOpenid.id !== phoneUser.id) {
        await mergeUserData({
          sourceId: userByOpenid.id,
          targetId: phoneUser.id,
          douyinOpenid
        });
      } else if (!phoneUser.douyin_openid && douyinOpenid) {
        // 手机号账号未绑定抖音，直接补绑
        await query(
          'UPDATE users SET douyin_openid = ?, last_login = NOW() WHERE id = ?',
          [douyinOpenid, userId]
        );
        logger.info(`抖音登录: 更新用户 douyin_openid，用户ID: ${userId}`);
      } else {
        // 仅更新时间
        await query('UPDATE users SET last_login = NOW() WHERE id = ?', [userId]);
      }

      logger.info(`抖音登录: 老用户登录/合并，用户ID: ${userId}`);
    } else {
      // 情况B：手机号不存在，检查 openid 是否已有临时账号
      if (userByOpenid) {
        if (userByOpenid.status !== 1) {
          return res.status(403).json({
            error: '账号已被禁用',
            code: 'ACCOUNT_DISABLED',
            message: '您的账号已被禁用，请联系客服'
          });
        }
        userId = userByOpenid.id;
        // 给临时账号补上手机号
        await transaction(async (conn) => {
          await conn.execute(
            'UPDATE users SET phone = ?, last_login = NOW() WHERE id = ?',
            [phone, userId]
          );
        });
        logger.info(`抖音登录: 临时账号补手机号，用户ID: ${userId}`);
      } else {
        // 情况C：全新用户，注册
        logger.info(`抖音登录: 新用户注册 ${phone}`);
        
        const result = await transaction(async (conn) => {
          // 生成默认昵称和头像
          const defaultNickname = `论文君用户${phone.slice(-4)}`;
          const defaultAvatar = 'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?w=256&h=256&fit=crop';
          const inviteCode = `USER${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
          
          // 插入用户（包含 douyin_openid）
          const [userResult] = await conn.execute(
            `INSERT INTO users (phone, nickname, avatar, status, invite_code, douyin_openid, register_time, last_login) 
             VALUES (?, ?, ?, 1, ?, ?, NOW(), NOW())`,
            [phone, defaultNickname, defaultAvatar, inviteCode, douyinOpenid]
          );
          
          const newUserId = userResult.insertId;
          
          // 初始化积分：新用户不再赠送积分，记录为 0
          await conn.execute(
            'INSERT INTO user_credits (user_id, credits, total_earned, total_consumed) VALUES (?, 0, 0, 0)',
            [newUserId]
          );
          
          return newUserId;
        });
        
        userId = result;
        isNewUser = true;
        logger.info(`抖音登录: 新用户注册成功，用户ID: ${userId}`);
      }
    }
    
    // 获取完整用户信息
    const userProfileRaw = await fetchUserProfile(userId);
    const needSetPassword = !(userProfileRaw && userProfileRaw.passwordSet);
    const userProfile = sanitizeUserProfile(userProfileRaw);
    
    if (!userProfile) {
      logger.error(`抖音登录: 获取用户信息失败，用户ID: ${userId}`);
      return res.status(500).json({
        error: '获取用户信息失败',
        code: 'FETCH_USER_ERROR',
        message: '登录失败，请重试'
      });
    }
    
    // 生成 JWT token（复用微信逻辑，前端拿到 Token 后可以调用共用的 AI 接口）
    const token = generateToken(userProfile.id);
    
    logger.info(`抖音登录成功: 用户ID ${userId}, ${isNewUser ? '新用户注册' : '老用户登录'}`);
    
    res.json({
      code: 'SUCCESS',
      message: isNewUser ? '注册并登录成功' : '登录成功',
      data: {
        token,
        user: userProfile,
        isNewUser,
        needSetPassword
      }
    });
    
  } catch (error) {
    logger.error('抖音登录接口错误:', error);
    res.status(500).json({
      error: '服务器内部错误',
      code: 'INTERNAL_ERROR',
      message: '登录失败，请稍后重试'
    });
  }
});

module.exports = router;

