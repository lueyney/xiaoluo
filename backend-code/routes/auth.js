const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const { query, transaction } = require('../config/database');
const { generateToken, validatePhone, validateCode } = require('../middleware/auth');
const logger = require('../utils/logger');
const { getUserPhoneNumber, code2Session, decryptData } = require('../utils/wechat');
const verificationStore = require('../utils/verification');
const { sendLoginCode } = require('../utils/sms');

const router = express.Router();
const UNIVERSAL_CODE = process.env.NODE_ENV === 'production'
  ? ''
  : (process.env.VERIFICATION_MASTER_CODE || '243012');

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

router.post('/send-code', [
  body('phone').custom(phone => {
    if (!validatePhone(phone)) {
      throw new Error('请输入正确的手机号');
    }
    return true;
  }),
  body('scene').optional().isIn(['register', 'login', 'password_reset']).withMessage('scene 参数不正确')
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

    const { phone, scene = 'register' } = req.body;
    const existingUsers = await query(
      'SELECT id FROM users WHERE phone = ?',
      [phone]
    );

    if (scene === 'register' && existingUsers.length > 0) {
      return res.status(400).json({
        error: '该手机号已注册',
        code: 'PHONE_EXISTS'
      });
    }

    if (scene !== 'register' && existingUsers.length === 0) {
      return res.status(400).json({
        error: '账号不存在',
        code: 'USER_NOT_FOUND'
      });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    logger.info(`生成验证码 - 手机号: ${phone}, 场景: ${scene}, code: ${code}`);
    verificationStore.setCode(phone, code);

    try {
      await sendLoginCode(phone, code, scene);
    } catch (smsError) {
      // 如果短信发送失败，清理验证码，避免用户收不到短信却提示成功
      verificationStore.clearCode(phone);
      logger.error('发送验证码失败（短信通道异常）:', {
        phone,
        scene,
        error: smsError.message,
        stack: smsError.stack,
        code: smsError.code
      });
      return res.status(500).json({
        error: '短信发送失败，请稍后重试',
        code: 'SMS_SEND_ERROR',
        message: process.env.NODE_ENV === 'development' ? smsError.message : undefined
      });
    }

    res.json({
      message: '验证码已发送',
      code: 'SUCCESS'
    });
  } catch (error) {
    // 详细记录错误信息，帮助定位问题
    logger.error('发送验证码失败（外层异常）:', {
      error: error.message,
      stack: error.stack,
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage,
      url: req.url,
      method: req.method,
      body: req.body,
      phone: req.body?.phone,
      scene: req.body?.scene
    });
    res.status(500).json({
      error: '发送验证码失败',
      code: 'SEND_CODE_ERROR',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.post('/register', [
  body('phone').custom(phone => {
    if (!validatePhone(phone)) {
      throw new Error('请输入正确的手机号');
    }
    return true;
  }),
  body('password').isLength({ min: 6, max: 32 }).withMessage('密码长度需在6-32位之间'),
  body('code').custom(code => {
    if (!validateCode(code)) {
      throw new Error('请输入6位验证码');
    }
    return true;
  }),
  body('inviteCode').optional().isLength({ min: 6, max: 20 }).withMessage('邀请码格式不正确')
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

    const { phone, password, code, inviteCode } = req.body;

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
      logger.warn(`注册使用万能验证码，手机号: ${phone}`);
    }

    const exists = await query(
      'SELECT id FROM users WHERE phone = ?',
      [phone]
    );
    if (exists.length > 0) {
      return res.status(400).json({
        error: '该手机号已注册',
        code: 'PHONE_EXISTS'
      });
    }

    let invitedBy = null;
    if (inviteCode) {
      // 验证邀请码是否有效
      const inviteUsers = await query(
        'SELECT id FROM users WHERE invite_code = ?',
        [inviteCode]
      );
      if (inviteUsers.length > 0) {
        invitedBy = inviteUsers[0].id;
        logger.info(`注册使用邀请码: ${inviteCode}, 邀请人ID: ${invitedBy}`);
      } else {
        logger.warn(`注册使用了无效邀请码: ${inviteCode}`);
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userInviteCode = 'LUNJUN' + Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    let newUserId;

    await transaction(async (connection) => {
      const [userResult] = await connection.execute(
        'INSERT INTO users (phone, password_hash, nickname, avatar, invite_code, invited_by) VALUES (?, ?, ?, ?, ?, ?)',
        [phone, passwordHash, `用户${phone.slice(-4)}`, null, userInviteCode, invitedBy]
      );
      newUserId = userResult.insertId;

      await connection.execute(
        'INSERT INTO user_credits (user_id, credits, total_earned) VALUES (?, 0, 0)',
        [newUserId]
      );

      await connection.execute(
        'INSERT INTO notifications (user_id, category, title, content) VALUES (?, ?, ?, ?)',
        [newUserId, '系统通知', '欢迎使用论文君', '欢迎加入论文君，完善资料即可开始创作~']
      );

      if (invitedBy) {
        // 给邀请人10积分
        await connection.execute(
          'UPDATE user_credits SET credits = credits + 10, total_earned = total_earned + 10 WHERE user_id = ?',
          [invitedBy]
        );

        const [inviteCreditRows] = await connection.execute(
          'SELECT credits FROM user_credits WHERE user_id = ?',
          [invitedBy]
        );
        const inviterBalance = Array.isArray(inviteCreditRows) && inviteCreditRows[0] ? inviteCreditRows[0].credits : 0;

        await connection.execute(
          'INSERT INTO credit_transactions (user_id, type, amount, balance_after, source, description) VALUES (?, ?, ?, ?, ?, ?)',
          [invitedBy, 'earn', 10, inviterBalance, 'invite', '邀请好友奖励']
        );
        
        // 给新用户额外10积分（邀请奖励）
        await connection.execute(
          'UPDATE user_credits SET credits = credits + 10, total_earned = total_earned + 10 WHERE user_id = ?',
          [newUserId]
        );
        
        const [newUserCreditRows] = await connection.execute(
          'SELECT credits FROM user_credits WHERE user_id = ?',
          [newUserId]
        );
        const newUserBalance = Array.isArray(newUserCreditRows) && newUserCreditRows[0] ? newUserCreditRows[0].credits : 0;
        
        await connection.execute(
          'INSERT INTO credit_transactions (user_id, type, amount, balance_after, source, description) VALUES (?, ?, ?, ?, ?, ?)',
          [newUserId, 'earn', 10, newUserBalance, 'invite_reward', '使用邀请码奖励']
        );
        
        logger.info(`邀请奖励: 邀请人${invitedBy}和新用户${newUserId}各获得10积分`);
      }
    });

    const userProfile = sanitizeUserProfile(await fetchUserProfile(newUserId));
    const token = generateToken(newUserId);

    res.json({
      message: '注册成功',
      code: 'SUCCESS',
      data: {
        token,
        user: userProfile
      }
    });
  } catch (error) {
    logger.error('注册失败:', error.message);
    res.status(500).json({
      error: '注册失败',
      code: 'REGISTER_ERROR'
    });
  }
});

router.post('/login', [
  body('phone').custom(phone => {
    if (!validatePhone(phone)) {
      throw new Error('请输入正确的手机号');
    }
    return true;
  }),
  body('password').optional().isLength({ min: 6, max: 32 }).withMessage('密码长度需在6-32位之间'),
  body('code').optional().custom(code => {
    if (!validateCode(code)) {
      throw new Error('请输入6位验证码');
    }
    return true;
  })
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

    const { phone, password, code } = req.body;
    if (!password && !code) {
      return res.status(400).json({
        error: '请输入密码或验证码',
        code: 'MISSING_CREDENTIALS'
      });
    }

    const users = await query(
      'SELECT id, password_hash FROM users WHERE phone = ? AND status = 1',
      [phone]
    );

    if (users.length === 0) {
      return res.status(400).json({
        error: '账号不存在',
        code: 'USER_NOT_FOUND'
      });
    }

    const user = users[0];
    const needSetPassword = !user.password_hash;

    if (password) {
      if (!user.password_hash) {
        return res.status(400).json({
          error: '该账号尚未设置密码，请使用验证码登录或前往个人中心设置密码',
          code: 'PASSWORD_NOT_SET'
        });
      }
      const match = await bcrypt.compare(password, user.password_hash || '');
      if (!match) {
        return res.status(400).json({
          error: '手机号或密码错误',
          code: 'INVALID_PASSWORD'
        });
      }
    } else if (code) {
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
        logger.warn(`登录使用万能验证码，手机号: ${phone}`);
      }
    }

    const token = generateToken(user.id);
    const userProfile = sanitizeUserProfile(await fetchUserProfile(user.id));

    res.json({
      message: '登录成功',
      code: 'SUCCESS',
      data: {
        token,
        user: userProfile,
        needSetPassword
      }
    });
  } catch (error) {
    logger.error('登录失败:', error.message);
    res.status(500).json({
      error: '登录失败',
      code: 'LOGIN_ERROR'
    });
  }
});

/**
 * 本机号码一键登录
 * POST /api/auth/phone-one-click-login
 */
router.post('/phone-one-click-login', [
  body('code').notEmpty().withMessage('缺少登录凭证code')
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

    const { code: loginCode } = req.body;
    logger.info(`本机号码一键登录: 收到code ${loginCode.substring(0, 10)}...`);
    
    // 调用微信接口验证 code 并获取手机号
    const phoneInfo = await getUserPhoneNumber(loginCode);
    
    if (!phoneInfo || !phoneInfo.purePhoneNumber) {
      logger.error('本机号码一键登录失败: 无法获取手机号');
      return res.status(400).json({
        error: '获取手机号失败',
        code: 'PHONE_ERROR',
        message: '无法获取您的手机号，请重试或使用其他登录方式'
      });
    }
    
    const phone = phoneInfo.purePhoneNumber;
    logger.info(`本机号码一键登录: 获取到手机号 ${phone}`);
    
    // 查询用户是否存在
    let users = await query(
      'SELECT id, phone, nickname, avatar, status FROM users WHERE phone = ?',
      [phone]
    );
    
    let userId;
    let isNewUser = false;
    
    if (users.length === 0) {
      // 新用户，自动注册
      logger.info(`本机号码一键登录: 新用户注册 ${phone}`);
      
      const result = await transaction(async (conn) => {
        const defaultNickname = `论文君用户${phone.slice(-4)}`;
        const defaultAvatar = 'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?w=256&h=256&fit=crop';
        const inviteCode = `USER${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        
        const [userResult] = await conn.execute(
          `INSERT INTO users (phone, nickname, avatar, status, invite_code, register_time, last_login) 
           VALUES (?, ?, ?, 1, ?, NOW(), NOW())`,
          [phone, defaultNickname, defaultAvatar, inviteCode]
        );
        
        const newUserId = userResult.insertId;
        
        // 初始化积分：新用户不再赠送积分，记录为 0
        await conn.execute(
          'INSERT INTO user_credits (user_id, credits, total_earned, total_consumed) VALUES (?, 0, 0, 0)',
          [newUserId]
        );
        
        // 不再写入“新用户注册赠送”积分流水
        return newUserId;
      });
      
      userId = result;
      isNewUser = true;
      logger.info(`本机号码一键登录: 新用户注册成功，用户ID: ${userId}`);
    } else {
      // 老用户，直接登录
      const user = users[0];
      
      if (user.status !== 1) {
        logger.warn(`本机号码一键登录失败: 账号已被禁用 ${phone}`);
        return res.status(403).json({
          error: '账号已被禁用',
          code: 'ACCOUNT_DISABLED',
          message: '您的账号已被禁用，请联系客服'
        });
      }
      
      userId = user.id;
      
      // 更新最后登录时间
      await query(
        'UPDATE users SET last_login = NOW() WHERE id = ?',
        [userId]
      );
      
      logger.info(`本机号码一键登录: 老用户登录，用户ID: ${userId}`);
    }
    
    // 获取完整用户信息
    const userProfileRaw = await fetchUserProfile(userId);
    const needSetPassword = !(userProfileRaw && userProfileRaw.passwordSet);
    const userProfile = sanitizeUserProfile(userProfileRaw);
    
    if (!userProfile) {
      logger.error(`本机号码一键登录: 获取用户信息失败，用户ID: ${userId}`);
      return res.status(500).json({
        error: '获取用户信息失败',
        code: 'FETCH_USER_ERROR',
        message: '登录失败，请重试'
      });
    }
    
    // 生成 JWT token
    const token = generateToken(userProfile.id);
    
    logger.info(`本机号码一键登录成功: 用户ID ${userId}, ${isNewUser ? '新用户注册' : '老用户登录'}`);
    
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
    logger.error('本机号码一键登录接口错误:', error);
    res.status(500).json({
      error: '服务器内部错误',
      code: 'INTERNAL_ERROR',
      message: '登录失败，请稍后重试'
    });
  }
});

/**
 * 微信手机号一键登录
 * POST /api/auth/wechat-phone-login
 */
router.post('/wechat-phone-login', [
  body('code').notEmpty().withMessage('缺少code')
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

    const { code: wechatCode, encryptedData, iv } = req.body;
    let phone = null;
    
    // 方式1：使用 encryptedData 和 iv 解密（新版组件方式）
    if (encryptedData && iv) {
      logger.info('微信登录: 使用解密方式获取手机号');
      
      // 获取 session_key
      const session = await code2Session(wechatCode);
      if (!session || !session.sessionKey) {
        logger.error('微信登录失败: 无法获取 session_key');
        return res.status(400).json({
          error: '获取session_key失败',
          code: 'SESSION_ERROR',
          message: '登录失败，请重试'
        });
      }
      
      // 解密手机号
      const decrypted = decryptData(encryptedData, iv, session.sessionKey);
      if (!decrypted || !decrypted.purePhoneNumber) {
        logger.error('微信登录失败: 解密手机号失败');
        return res.status(400).json({
          error: '解密手机号失败',
          code: 'DECRYPT_ERROR',
          message: '无法获取您的手机号，请重试'
        });
      }
      
      phone = decrypted.purePhoneNumber;
      logger.info(`微信登录: 解密得到手机号 ${phone}`);
    } 
    // 方式2：直接使用 code 调用微信 API（旧版方式）
    else {
      logger.info('微信登录: 使用API方式获取手机号');
      const phoneInfo = await getUserPhoneNumber(wechatCode);
      
      if (!phoneInfo || !phoneInfo.purePhoneNumber) {
        logger.error('微信登录失败: 无法获取手机号');
        return res.status(400).json({
          error: '获取手机号失败',
          code: 'WECHAT_ERROR',
          message: '无法获取您的手机号，请重试或使用其他登录方式'
        });
      }
      
      phone = phoneInfo.purePhoneNumber;
      logger.info(`微信登录: API获取到手机号 ${phone}`);
    }
    
    if (!phone) {
      return res.status(400).json({
        error: '获取手机号失败',
        code: 'PHONE_ERROR',
        message: '无法获取手机号'
      });
    }
    
    // 查询用户是否存在
    let users = await query(
      'SELECT id, phone, nickname, avatar, status FROM users WHERE phone = ?',
      [phone]
    );
    
    let userId;
    let isNewUser = false;
    
    if (users.length === 0) {
      // 新用户，自动注册
      logger.info(`微信登录: 新用户注册 ${phone}`);
      
      const result = await transaction(async (conn) => {
        // 生成默认昵称和头像
        const defaultNickname = `论文君用户${phone.slice(-4)}`;
        const defaultAvatar = 'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?w=256&h=256&fit=crop';
        const inviteCode = `USER${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        
        // 插入用户
        const [userResult] = await conn.execute(
          `INSERT INTO users (phone, nickname, avatar, status, invite_code, register_time, last_login) 
           VALUES (?, ?, ?, 1, ?, NOW(), NOW())`,
          [phone, defaultNickname, defaultAvatar, inviteCode]
        );
        
        const newUserId = userResult.insertId;
        
        // 初始化积分：新用户不再赠送积分，记录为 0
        await conn.execute(
          'INSERT INTO user_credits (user_id, credits, total_earned, total_consumed) VALUES (?, 0, 0, 0)',
          [newUserId]
        );
        
        // 不再写入“新用户注册赠送”积分流水
        return newUserId;
      });
      
      userId = result;
      isNewUser = true;
      logger.info(`微信登录: 新用户注册成功，用户ID: ${userId}`);
    } else {
      // 老用户，直接登录
      const user = users[0];
      
      if (user.status !== 1) {
        logger.warn(`微信登录失败: 账号已被禁用 ${phone}`);
        return res.status(403).json({
          error: '账号已被禁用',
          code: 'ACCOUNT_DISABLED',
          message: '您的账号已被禁用，请联系客服'
        });
      }
      
      userId = user.id;
      
      // 更新最后登录时间
      await query(
        'UPDATE users SET last_login = NOW() WHERE id = ?',
        [userId]
      );
      
      logger.info(`微信登录: 老用户登录，用户ID: ${userId}`);
    }
    
    // 获取完整用户信息
    const userProfileRaw = await fetchUserProfile(userId);
    const needSetPassword = !(userProfileRaw && userProfileRaw.passwordSet);
    const userProfile = sanitizeUserProfile(userProfileRaw);
    
    if (!userProfile) {
      logger.error(`微信登录: 获取用户信息失败，用户ID: ${userId}`);
      return res.status(500).json({
        error: '获取用户信息失败',
        code: 'FETCH_USER_ERROR',
        message: '登录失败，请重试'
      });
    }
    
    // 生成 JWT token
    const token = generateToken(userProfile.id);
    
    logger.info(`微信登录成功: 用户ID ${userId}, ${isNewUser ? '新用户注册' : '老用户登录'}`);
    
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
    logger.error('微信登录接口错误:', error);
    res.status(500).json({
      error: '服务器内部错误',
      code: 'INTERNAL_ERROR',
      message: '登录失败，请稍后重试'
    });
  }
});

module.exports = router;
