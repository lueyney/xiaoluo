// 微信支付 API 路由（网页端 Native 扫码支付）

const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, transaction } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const wechatPayV3 = require('../utils/wechat-pay-v3');
const { code2Session } = require('../utils/wechat');
const { validatePackage, calculateCredits } = require('../config/recharge-packages');

const router = express.Router();

// ============================================================
// 工具函数：事务内发放积分（供 notify 和 poll-order 共用）
// ============================================================
async function grantCredits(conn, { orderId, userId, packageId, isFirstRecharge, transactionId, amount }) {
  const [userRows] = await conn.execute(
    'SELECT has_used_first_recharge FROM users WHERE id = ? FOR UPDATE',
    [userId]
  );
  if (!userRows.length) throw new Error(`未找到用户 ${userId}`);

  const hasUsedFirstRecharge = userRows[0].has_used_first_recharge === 1;
  const creditPlan = calculateCredits(packageId, hasUsedFirstRecharge);
  const finalCredits = creditPlan.totalCredits;
  const grantBonus = isFirstRecharge && !hasUsedFirstRecharge && creditPlan.isFirstRecharge;

  // 原子性更新订单（WHERE status='pending' 防重复发放）
  const [upd] = await conn.execute(
    `UPDATE payment_orders SET status='paid', trade_no=?, paid_at=NOW(), credits=? WHERE id=? AND status='pending'`,
    [transactionId, finalCredits, orderId]
  );

  if (upd.affectedRows === 0) {
    // 已被其他请求处理
    const [cr] = await conn.execute('SELECT credits FROM user_credits WHERE user_id=?', [userId]);
    const [po] = await conn.execute('SELECT credits FROM payment_orders WHERE id=?', [orderId]);
    return { alreadyProcessed: true, finalCredits: po[0]?.credits || 0, finalBalance: cr[0]?.credits || 0 };
  }

  if (grantBonus) {
    await conn.execute('UPDATE users SET has_used_first_recharge=1 WHERE id=?', [userId]);
  }

  await conn.execute(
    'UPDATE user_credits SET credits=credits+?, total_earned=total_earned+? WHERE user_id=?',
    [finalCredits, finalCredits, userId]
  );

  const [cr] = await conn.execute('SELECT credits FROM user_credits WHERE user_id=?', [userId]);
  const finalBalance = cr[0].credits;

  const desc = grantBonus
    ? `首充特惠：充值¥${amount}获得${finalCredits}积分`
    : `充值¥${amount}获得${finalCredits}积分`;
  await conn.execute(
    `INSERT INTO credit_transactions (user_id,type,amount,balance_after,source,description,created_at)
     VALUES (?,'earn',?,?,'recharge',?,NOW())`,
    [userId, finalCredits, finalBalance, desc]
  );

  return { alreadyProcessed: false, finalCredits, finalBalance };
}

// ============================================================
// 微信支付回调（无需认证）
// POST /api/wechat-pay/notify
// 注意：raw body 由 app.js 在全局 JSON 解析前挂载
// ============================================================
router.post('/notify', async (req, res) => {
  const sendOk   = () => res.json({ code: 'SUCCESS', message: '' });
  const sendFail = (msg) => res.status(500).json({ code: 'FAIL', message: msg });

  try {
    let body;
    try {
      body = JSON.parse(req.body.toString('utf8'));
    } catch (e) {
      logger.error('[Notify] Body解析失败:', e.message);
      return sendFail('Body解析失败');
    }

    logger.info('[Notify] 收到微信支付回调');

    const result = wechatPayV3.handlePaymentNotify(req.headers, body);
    if (!result.success) {
      logger.error('[Notify] 解密失败:', result.error);
      return sendFail(result.error);
    }

    // 只处理支付成功的回调
    if (result.tradeState !== 'SUCCESS') {
      logger.info(`[Notify] 非支付成功状态: ${result.tradeState}，忽略`);
      return sendOk();
    }

    const { outTradeNo, transactionId, amount } = result;
    logger.info(`[Notify] 支付成功: ${outTradeNo}, 微信单号: ${transactionId}, 金额: ${amount}分`);

    // 用 out_trade_no 直接查库，不再依赖末6位猜 orderId
    const orders = await query('SELECT * FROM payment_orders WHERE out_trade_no=?', [outTradeNo]);
    if (!orders.length) {
      logger.error('[Notify] 订单不存在:', outTradeNo);
      return sendOk(); // 防止微信反复重试
    }

    const order = orders[0];
    if (order.status === 'paid') {
      logger.info('[Notify] 订单已处理，幂等返回');
      return sendOk();
    }

    let grantResult;
    await transaction(async (conn) => {
      grantResult = await grantCredits(conn, {
        orderId:        order.id,
        userId:         order.user_id,
        packageId:      order.package_id,
        isFirstRecharge: !!order.is_first_recharge,
        transactionId,
        amount:         order.amount
      });
    });

    logger.info(`[Notify] 处理完成: 用户${order.user_id} +${grantResult.finalCredits}积分${grantResult.alreadyProcessed ? '（已处理）' : ''}`);
    return sendOk();

  } catch (err) {
    logger.error('[Notify] 处理回调异常:', err);
    return sendFail('系统错误');
  }
});

// ============================================================
// 以下路由需要认证
// ============================================================
router.use(authenticateToken);
router.post('/create-order', [
  body('code').notEmpty().withMessage('微信登录code不能为空'),
  body('packageId').isInt().withMessage('套餐ID必须是整数'),
  body('amount').isFloat({ min: 0 }).withMessage('金额必须大于等于0'),
  body('credits').isInt({ min: 1 }).withMessage('积分必须大于0'),
  body('isFirstTime').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: '参数验证失败', code: 'VALIDATION_ERROR', details: errors.array() });
    }

    const userId = req.user.id;
    const { code, packageId, amount, credits, isFirstTime } = req.body;

    const users = await query('SELECT has_used_first_recharge FROM users WHERE id=?', [userId]);
    if (!users.length) {
      return res.status(404).json({ error: '用户不存在', code: 'USER_NOT_FOUND' });
    }

    const hasUsedFirstRecharge = users[0].has_used_first_recharge === 1;
    const wantsFirstRecharge = Boolean(isFirstTime);
    if (wantsFirstRecharge && hasUsedFirstRecharge) {
      return res.status(400).json({ error: '您已领取过新用户免费积分', code: 'FIRST_RECHARGE_USED' });
    }

    const effectiveFirst = wantsFirstRecharge && !hasUsedFirstRecharge;
    const validation = validatePackage(packageId, amount, credits, effectiveFirst);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error, code: 'PACKAGE_VALIDATION_FAILED' });
    }

    if (Number(amount) === 0) {
      let finalBalance = 0;
      let finalCredits = credits;
      await transaction(async (conn) => {
        const [uRows] = await conn.execute('SELECT has_used_first_recharge FROM users WHERE id=? FOR UPDATE', [userId]);
        if (!uRows.length) throw new Error('用户不存在');
        if (uRows[0].has_used_first_recharge === 1) {
          throw Object.assign(new Error('您已领取过新用户免费积分'), { code: 'FIRST_RECHARGE_USED' });
        }
        const [ins] = await conn.execute(
          `INSERT INTO payment_orders (user_id,package_id,amount,credits,is_first_recharge,status,created_at,paid_at) VALUES (?,?,0,?,1,'paid',NOW(),NOW())`,
          [userId, packageId, credits]
        );
        const ts = Date.now().toString().slice(-10);
        const outNo = `WXFREE${ts}${ins.insertId.toString().padStart(6,'0')}`;
        await conn.execute('UPDATE payment_orders SET out_trade_no=? WHERE id=?', [outNo, ins.insertId]);
        await conn.execute('UPDATE users SET has_used_first_recharge=1 WHERE id=?', [userId]);
        await conn.execute('UPDATE user_credits SET credits=credits+?,total_earned=total_earned+? WHERE user_id=?', [credits, credits, userId]);
        const [cr] = await conn.execute('SELECT credits FROM user_credits WHERE user_id=?', [userId]);
        finalBalance = cr[0].credits;
        await conn.execute(
          `INSERT INTO credit_transactions (user_id,type,amount,balance_after,source,description,created_at) VALUES (?,'earn',?,?,'recharge',?,NOW())`,
          [userId, credits, finalBalance, `新用户免费领取${credits}积分`]
        );
      });

      return res.json({
        code: 'SUCCESS',
        message: '积分已到账',
        data: { free: true, orderId: null, credits: finalCredits, balance: finalBalance, payParams: { mock: true, free: true } }
      });
    }

    const configCheck = wechatPayV3.ensurePaymentConfigured('create-mini-program-order');
    if (!configCheck.ready) {
      return res.status(503).json({
        error: '微信支付服务暂不可用，请稍后再试',
        code: configCheck.code
      });
    }

    const session = await code2Session(code);
    if (!session || !session.openid) {
      return res.status(400).json({ error: '获取微信用户标识失败，请重试', code: 'WECHAT_CODE_INVALID' });
    }

    const { orderId, outTradeNo } = await transaction(async (conn) => {
      const [ins] = await conn.execute(
        `INSERT INTO payment_orders (user_id,package_id,amount,credits,is_first_recharge,status,created_at) VALUES (?,?,?,?,?,'pending',NOW())`,
        [userId, packageId, amount, credits, effectiveFirst ? 1 : 0]
      );
      const ts = Date.now().toString().slice(-10);
      const no = `WXORD${ts}${ins.insertId.toString().padStart(6,'0')}`;
      await conn.execute('UPDATE payment_orders SET out_trade_no=? WHERE id=?', [no, ins.insertId]);
      return { orderId: ins.insertId, outTradeNo: no };
    });

    const jsapiResult = await wechatPayV3.createJsapiOrder({
      outTradeNo,
      description: `充值${credits}积分`,
      amount: Math.round(Number(amount) * 100),
      openid: session.openid
    });

    if (!jsapiResult.success) {
      await query(`UPDATE payment_orders SET status='failed' WHERE id=?`, [orderId]);
      if (jsapiResult.code === 'WECHAT_PAY_NOT_CONFIGURED') {
        return res.status(503).json({ error: '微信支付服务暂不可用，请稍后再试', code: jsapiResult.code });
      }
      return res.status(500).json({ error: '创建支付订单失败', code: 'WECHAT_PAY_FAILED', message: jsapiResult.error });
    }

    const payParams = wechatPayV3.generateMiniProgramPayParams(jsapiResult.prepayId);
    return res.json({ code: 'SUCCESS', data: { orderId, outTradeNo, amount, credits, payParams } });
  } catch (err) {
    if (err.code === 'FIRST_RECHARGE_USED') {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    if (err.code === 'WECHAT_PAY_NOT_CONFIGURED') {
      return res.status(503).json({ error: '微信支付服务暂不可用，请稍后再试', code: err.code });
    }
    logger.error('[MiniPay] 创建订单失败:', err);
    return res.status(500).json({ error: '创建订单失败', code: 'CREATE_ORDER_ERROR', message: err.message });
  }
});

router.post('/query-and-complete', [
  body('orderId').isInt().withMessage('订单ID必须是整数')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: '参数验证失败', code: 'VALIDATION_ERROR', details: errors.array() });
    }

    const userId = req.user.id;
    const orderId = Number(req.body.orderId);
    const orders = await query('SELECT * FROM payment_orders WHERE id=? AND user_id=?', [orderId, userId]);
    if (!orders.length) {
      return res.status(404).json({ error: '订单不存在', code: 'ORDER_NOT_FOUND' });
    }

    const order = orders[0];
    if (order.status === 'paid') {
      const crRows = await query('SELECT credits FROM user_credits WHERE user_id=?', [userId]);
      return res.json({ code: 'SUCCESS', data: { status: 'paid', credits: order.credits, balance: crRows[0]?.credits || 0 } });
    }

    if (order.status !== 'pending' || !order.out_trade_no) {
      return res.json({ code: 'ORDER_NOT_PAID', error: '订单未支付' });
    }

    const qr = await wechatPayV3.queryOrder(order.out_trade_no);
    if (!qr.success || qr.tradeState !== 'SUCCESS') {
      return res.json({ code: 'ORDER_NOT_PAID', error: '订单未支付' });
    }

    let grantResult;
    await transaction(async (conn) => {
      grantResult = await grantCredits(conn, {
        orderId,
        userId,
        packageId: order.package_id,
        isFirstRecharge: !!order.is_first_recharge,
        transactionId: qr.transactionId,
        amount: order.amount
      });
    });

    return res.json({ code: 'SUCCESS', data: { status: 'paid', credits: grantResult.finalCredits, balance: grantResult.finalBalance } });
  } catch (err) {
    logger.error('[QueryAndComplete] 处理失败:', err);
    return res.status(500).json({ error: '查询订单失败', code: 'QUERY_ORDER_ERROR', message: err.message });
  }
});

// ============================================================
// 网页端：Native 扫码支付下单
// POST /api/wechat-pay/create-web-order
// ============================================================
router.post('/create-web-order', [
  body('packageId').isInt().withMessage('套餐ID必须是整数'),
  body('amount').isFloat({ min: 0 }).withMessage('金额必须大于等于0'),
  body('credits').isInt({ min: 1 }).withMessage('积分必须大于0'),
  body('isFirstTime').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: '参数验证失败', code: 'VALIDATION_ERROR', details: errors.array() });

    const userId = req.user.id;
    const { packageId, amount, credits, isFirstTime } = req.body;
    logger.info(`[WebPay] 用户${userId} 创建订单: 套餐${packageId}, ¥${amount}, ${credits}积分`);

    const users = await query('SELECT has_used_first_recharge FROM users WHERE id=?', [userId]);
    if (!users.length) return res.status(404).json({ error: '用户不存在', code: 'USER_NOT_FOUND' });

    const hasUsedFirstRecharge = users[0].has_used_first_recharge === 1;
    const wantsFirstRecharge = Boolean(isFirstTime);
    if (wantsFirstRecharge && hasUsedFirstRecharge) return res.status(400).json({ error: '您已领取过新用户免费积分', code: 'FIRST_RECHARGE_USED' });

    const effectiveFirst = wantsFirstRecharge && !hasUsedFirstRecharge;
    const validation = validatePackage(packageId, amount, credits, effectiveFirst);
    if (!validation.valid) return res.status(400).json({ error: validation.error, code: 'PACKAGE_VALIDATION_FAILED' });

    // 免费套餐：直接发放积分
    if (Number(amount) === 0) {
      let finalBalance = 0;
      await transaction(async (conn) => {
        const [uRows] = await conn.execute('SELECT has_used_first_recharge FROM users WHERE id=? FOR UPDATE', [userId]);
        if (!uRows.length) throw new Error('用户不存在');
        if (uRows[0].has_used_first_recharge === 1) throw Object.assign(new Error('您已领取过新用户免费积分'), { code: 'FIRST_RECHARGE_USED' });
        const ts = Date.now().toString().slice(-10);
        const [ins] = await conn.execute(
          `INSERT INTO payment_orders (user_id,package_id,amount,credits,is_first_recharge,status,created_at) VALUES (?,?,0,?,1,'paid',NOW())`,
          [userId, packageId, credits]
        );
        const outNo = `WEBFREE${ts}${ins.insertId.toString().padStart(6,'0')}`;
        await conn.execute('UPDATE payment_orders SET out_trade_no=?,paid_at=NOW() WHERE id=?', [outNo, ins.insertId]);
        await conn.execute('UPDATE users SET has_used_first_recharge=1 WHERE id=?', [userId]);
        await conn.execute('UPDATE user_credits SET credits=credits+?,total_earned=total_earned+? WHERE user_id=?', [credits, credits, userId]);
        const [cr] = await conn.execute('SELECT credits FROM user_credits WHERE user_id=?', [userId]);
        finalBalance = cr[0].credits;
        await conn.execute(
          `INSERT INTO credit_transactions (user_id,type,amount,balance_after,source,description,created_at) VALUES (?,'earn',?,?,'recharge',?,NOW())`,
          [userId, credits, finalBalance, `新用户免费领取${credits}积分`]
        );
      });
      return res.json({ code: 'SUCCESS', message: '积分已到账', data: { free: true, credits, balance: finalBalance } });
    }

    const configCheck = wechatPayV3.ensurePaymentConfigured('create-web-order');
    if (!configCheck.ready) {
      return res.status(503).json({
        error: '微信支付服务暂不可用，请稍后再试',
        code: configCheck.code
      });
    }

    // 付费套餐：同一用户/套餐短时间内只保留一个有效Native订单，避免双击重复下单。
    const orderState = await transaction(async (conn) => {
      const [lockedUsers] = await conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE', [userId]);
      if (!lockedUsers.length) throw Object.assign(new Error('用户不存在'), { code: 'USER_NOT_FOUND' });
      const [existingRows] = await conn.execute(
        `SELECT id,out_trade_no,code_url,TIMESTAMPDIFF(SECOND,created_at,NOW()) AS age_seconds
           FROM payment_orders
          WHERE user_id=? AND package_id=? AND amount=? AND credits=?
            AND status='pending' AND out_trade_no LIKE 'WEBORD%'
            AND created_at >= DATE_SUB(NOW(),INTERVAL 10 MINUTE)
          ORDER BY id DESC LIMIT 1 FOR UPDATE`,
        [userId, packageId, amount, credits]
      );

      const existing = existingRows[0];
      if (existing && existing.code_url) {
        return {
          reused: true,
          orderId: existing.id,
          outTradeNo: existing.out_trade_no,
          codeUrl: existing.code_url
        };
      }
      if (existing && Number(existing.age_seconds) < 30) {
        return {
          creating: true,
          orderId: existing.id,
          outTradeNo: existing.out_trade_no
        };
      }
      if (existing) {
        await conn.execute("UPDATE payment_orders SET status='failed' WHERE id=? AND status='pending'", [existing.id]);
      }

      const [ins] = await conn.execute(
        `INSERT INTO payment_orders (user_id,package_id,amount,credits,is_first_recharge,status,created_at) VALUES (?,?,?,?,?,'pending',NOW())`,
        [userId, packageId, amount, credits, effectiveFirst ? 1 : 0]
      );
      const ts = Date.now().toString().slice(-10);
      const no = `WEBORD${ts}${ins.insertId.toString().padStart(6,'0')}`;
      await conn.execute('UPDATE payment_orders SET out_trade_no=? WHERE id=?', [no, ins.insertId]);
      return { orderId: ins.insertId, outTradeNo: no };
    });

    if (orderState.reused) {
      logger.info(`[WebPay] 复用待支付订单: ID=${orderState.orderId}, 单号=${orderState.outTradeNo}`);
      return res.json({
        code: 'SUCCESS',
        data: {
          orderId: orderState.orderId,
          outTradeNo: orderState.outTradeNo,
          amount,
          credits,
          codeUrl: orderState.codeUrl,
          reused: true
        }
      });
    }
    if (orderState.creating) {
      return res.status(409).json({
        error: '支付订单正在创建，请勿重复点击',
        code: 'ORDER_CREATION_IN_PROGRESS'
      });
    }

    const { orderId, outTradeNo } = orderState;

    logger.info(`[WebPay] 订单: ID=${orderId}, 单号=${outTradeNo}`);

    const nativeResult = await wechatPayV3.createNativeOrder({
      outTradeNo,
      description: `充值${credits}积分`,
      amount: Math.round(amount * 100)
    });

    if (!nativeResult.success) {
      await query(`UPDATE payment_orders SET status='failed' WHERE id=?`, [orderId]);
      if (nativeResult.code === 'NO_AUTH') return res.status(503).json({ error: '当前暂不支持扫码支付，请联系管理员开通该功能', code: 'NO_AUTH' });
      if (nativeResult.code === 'WECHAT_PAY_NOT_CONFIGURED') {
        return res.status(503).json({ error: '微信支付服务暂不可用，请稍后再试', code: nativeResult.code });
      }
      return res.status(500).json({ error: '创建支付二维码失败', code: 'WECHAT_PAY_FAILED', message: nativeResult.error });
    }

    await query('UPDATE payment_orders SET code_url=? WHERE id=? AND status=\'pending\'', [nativeResult.codeUrl, orderId]);

    return res.json({ code: 'SUCCESS', data: { orderId, outTradeNo, amount, credits, codeUrl: nativeResult.codeUrl } });

  } catch (err) {
    if (err.code === 'FIRST_RECHARGE_USED') return res.status(400).json({ error: err.message, code: err.code });
    logger.error('[WebPay] 创建订单失败:', err);
    return res.status(500).json({ error: '创建订单失败', code: 'CREATE_ORDER_ERROR', message: err.message });
  }
});

// ============================================================
// 网页端：轮询订单支付状态（含主动查单兜底）
// GET /api/wechat-pay/poll-order/:orderId
// ============================================================
router.get('/poll-order/:orderId', async (req, res) => {
  try {
    const userId = req.user.id;
    const orderId = parseInt(req.params.orderId);
    if (isNaN(orderId)) return res.status(400).json({ error: '无效订单ID', code: 'INVALID_ORDER_ID' });

    const orders = await query('SELECT * FROM payment_orders WHERE id=? AND user_id=?', [orderId, userId]);
    if (!orders.length) return res.status(404).json({ error: '订单不存在', code: 'ORDER_NOT_FOUND' });
    const order = orders[0];

    // 已支付，直接返回
    if (order.status === 'paid') {
      const crRows = await query('SELECT credits FROM user_credits WHERE user_id=?', [userId]);
      return res.json({ code: 'SUCCESS', data: { status: 'paid', credits: order.credits, balance: crRows[0]?.credits || 0 } });
    }

    // pending：主动向微信查单（防回调丢失）
    if (order.status === 'pending' && order.out_trade_no) {
      try {
        const qr = await wechatPayV3.queryOrder(order.out_trade_no);
        if (qr.success && qr.tradeState === 'SUCCESS') {
          logger.info(`[Poll] 微信确认已支付，主动完成订单 ${orderId}`);
          let grantResult;
          await transaction(async (conn) => {
            grantResult = await grantCredits(conn, {
              orderId,
              userId,
              packageId:      order.package_id,
              isFirstRecharge: !!order.is_first_recharge,
              transactionId:  qr.transactionId,
              amount:         order.amount
            });
          });
          return res.json({ code: 'SUCCESS', data: { status: 'paid', credits: grantResult.finalCredits, balance: grantResult.finalBalance } });
        }
      } catch (qErr) {
        logger.warn('[Poll] 主动查单失败（不影响轮询）:', qErr.message);
      }
    }

    return res.json({ code: 'SUCCESS', data: { status: order.status } });
  } catch (err) {
    logger.error('[Poll] 轮询失败:', err);
    return res.status(500).json({ error: '查询失败', code: 'POLL_ERROR' });
  }
});

// ============================================================
// 获取用户微信支付订单列表
// GET /api/wechat-pay/orders
// ============================================================
router.get('/orders', async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;
    const limitNum = Number.isFinite(Number(req.query.limit)) && Number(req.query.limit) > 0
      ? Math.min(100, Math.floor(Number(req.query.limit)))
      : 20;
    const offsetNum = Number.isFinite(Number(req.query.offset)) && Number(req.query.offset) >= 0
      ? Math.floor(Number(req.query.offset))
      : 0;
    let sql = 'SELECT * FROM payment_orders WHERE user_id=?';
    const params = [userId];
    if (status && ['pending','paid','failed','cancelled'].includes(status)) {
      sql += ' AND status=?';
      params.push(status);
    }
    sql += ` ORDER BY created_at DESC LIMIT ${limitNum} OFFSET ${offsetNum}`;
    const rows = await query(sql, params);
    return res.json({
      code: 'SUCCESS',
      data: {
        orders: rows.map(o => ({ orderId: o.id, status: o.status, amount: o.amount, credits: o.credits, createdAt: o.created_at, paidAt: o.paid_at, tradeNo: o.trade_no })),
        total: rows.length
      }
    });
  } catch (err) {
    logger.error('[Orders] 查询失败:', err);
    return res.status(500).json({ error: '查询订单列表失败', code: 'QUERY_ORDERS_ERROR' });
  }
});

// ============================================================
// 检查首充状态
// GET /api/wechat-pay/check-first-recharge
// ============================================================
router.get('/check-first-recharge', async (req, res) => {
  try {
    const userId = req.user.id;
    const users = await query('SELECT has_used_first_recharge FROM users WHERE id=?', [userId]);
    const hasFirstRecharge = users.length > 0 ? users[0].has_used_first_recharge === 1 : false;
    return res.json({ code: 'SUCCESS', data: { hasFirstRecharge } });
  } catch (err) {
    logger.error('[FirstRecharge] 查询失败:', err);
    return res.status(500).json({ error: '检查首充状态失败', code: 'CHECK_FIRST_RECHARGE_ERROR' });
  }
});

module.exports = router;
