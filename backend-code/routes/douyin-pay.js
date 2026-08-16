// 抖音支付完整闭环 API 路由
// 已实现：创建订单、支付回调、查询订单状态等功能

const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, transaction } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const { code2Session, generateDouyinSign } = require('../utils/douyin');
const { validatePackage, calculateCredits } = require('../config/recharge-packages');

const router = express.Router();

// 所有路由都需要认证（除了回调）
router.use((req, res, next) => {
  if (req.path === '/notify') {
    return next(); // 回调不需要认证
  }
  return authenticateToken(req, res, next);
});

// 签名函数已移至 utils/douyin.js，直接使用 generateDouyinSign

/**
 * 创建抖音支付订单
 * POST /api/douyin/pay/create-order
 */
router.post('/create-order', [
  body('code').notEmpty().withMessage('抖音登录code不能为空'),
  body('anonymousCode').optional().isString().withMessage('anonymousCode必须是字符串'),
  body('packageId').isInt().withMessage('套餐ID必须是整数'),
  body('amount').isFloat({ min: 0 }).withMessage('金额必须大于0'),
  body('credits').isInt({ min: 1 }).withMessage('积分必须大于0'),
  body('isFirstTime').optional().isBoolean().withMessage('首充标识必须是布尔值')
], async (req, res) => {
  try {
    logger.info('========================================');
    logger.info('🛒 开始创建抖音充值订单');
    logger.info('========================================');

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.error('❌ 参数验证失败:', errors.array());
      return res.status(400).json({
        error: '参数验证失败',
        code: 'VALIDATION_ERROR',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const { code, packageId, amount, credits, isFirstTime } = req.body;

    logger.info(`📝 订单信息:`);
    logger.info(`   用户ID: ${userId}`);
    logger.info(`   套餐ID: ${packageId}`);
    logger.info(`   金额: ¥${amount}`);
    logger.info(`   积分: ${credits}`);
    logger.info(`   首充: ${isFirstTime ? '是' : '否'}`);

    const users = await query(
      'SELECT has_used_first_recharge FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      logger.error(`❌ 未找到用户: ${userId}`);
      return res.status(404).json({
        error: '用户不存在',
        code: 'USER_NOT_FOUND'
      });
    }

    const hasUsedFirstRecharge = users[0].has_used_first_recharge === 1;
    const wantsFirstRecharge = Boolean(isFirstTime);

    if (wantsFirstRecharge && hasUsedFirstRecharge) {
      logger.warn(`⚠️  用户${userId} 尝试重复首充`);
      return res.status(400).json({
        error: '您已经使用过首充优惠',
        code: 'FIRST_RECHARGE_USED'
      });
    }

    const effectiveFirstRechargeFlag = wantsFirstRecharge && !hasUsedFirstRecharge;

    // 验证套餐参数
    const validation = validatePackage(packageId, amount, credits, effectiveFirstRechargeFlag);
    if (!validation.valid) {
      logger.error(`❌ 套餐验证失败: ${validation.error}`);
      return res.status(400).json({
        error: validation.error,
        code: 'PACKAGE_VALIDATION_FAILED'
      });
    }
    logger.info(`✅ 套餐验证通过: ${validation.package.name}`);

    // 通过code获取抖音 openid
    logger.info('🔑 步骤: 获取抖音用户openid...');
    const sessionData = await code2Session(code);
    
    if (!sessionData || !sessionData.openid) {
      logger.error('❌ 获取抖音openid失败');
      return res.status(400).json({
        error: '获取用户信息失败，请重新登录',
        code: 'GET_OPENID_FAILED'
      });
    }

    const douyinOpenid = sessionData.openid;
    logger.info(`✅ 抖音openid获取成功: ${douyinOpenid.substring(0, 10)}***`);

    // 创建订单记录并生成商户订单号
    logger.info('💾 创建订单记录...');
    const { orderId, outTradeNo } = await transaction(async (conn) => {
      // 先插入订单获取ID（复用 payment_orders 表，通过 platform 字段区分）
      const [result] = await conn.execute(
        `INSERT INTO payment_orders (user_id, package_id, amount, credits, is_first_recharge, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', NOW())`,
        [userId, packageId, amount, credits, validation.package.isFirstRecharge ? 1 : 0]
      );
      
      const newOrderId = result.insertId;
      
      // 生成商户订单号（格式：DOUYINtimestamp000001）
      const timestamp = Date.now().toString().slice(-10);
      const newOutTradeNo = `DOUYIN${timestamp}${newOrderId.toString().padStart(6, '0')}`;
      
      // 更新商户订单号
      await conn.execute(
        'UPDATE payment_orders SET out_trade_no = ? WHERE id = ?',
        [newOutTradeNo, newOrderId]
      );
      
      return { orderId: newOrderId, outTradeNo: newOutTradeNo };
    });

    logger.info(`✅ 订单创建成功: ID=${orderId}, 商户订单号=${outTradeNo}`);

    // TODO: 调用抖音支付统一下单 API
    // 参考文档：https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/ecpay/pay-list/pay
    logger.info('========================================');
    logger.info('💳 步骤: 调用抖音支付统一下单');
    logger.info('========================================');

    // 检查是否配置了抖音支付
    const douyinAppId = process.env.DOUYIN_APP_ID;
    const douyinMerchantId = process.env.DOUYIN_MERCHANT_ID;
    const douyinSalt = process.env.DOUYIN_PAY_SALT; // 抖音支付签名用的 SALT

    if (!douyinAppId || !douyinMerchantId || !douyinSalt) {
      logger.warn('⚠️  未配置抖音支付，返回模拟模式');
      return res.json({
        code: 'SUCCESS',
        message: '订单创建成功（开发模式）',
        data: {
          orderId,
          amount,
          credits,
          payInfo: { 
            mock: true,
            order_id: outTradeNo,
            order_token: 'mock_token'
          }
        }
      });
    }

    // 调用抖音支付统一下单 API
    // 参考文档：https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/ecpay/pay-list/pay
    const preOrderParams = {
      app_id: douyinAppId,
      merchant_id: douyinMerchantId,
      out_order_no: outTradeNo,
      total_amount: Math.round(amount * 100), // 金额（分）
      subject: `充值${credits}积分`,
      body: `充值${credits}积分`,
      valid_time: 1800, // 订单有效期（秒），默认30分钟
      open_id: douyinOpenid
    };

    // 生成签名
    const sign = generateDouyinSign(preOrderParams, douyinSalt);
    preOrderParams.sign = sign;

    logger.info('预下单请求参数:', { ...preOrderParams, sign: '***' });

    // 调用抖音支付预下单 API
    const axios = require('axios');
    
    try {
      const preOrderResponse = await axios.post(
        'https://open.douyin.com/pay/v2/create_order',
        preOrderParams,
        { 
          headers: { 'Content-Type': 'application/json' }, 
          timeout: 15000 
        }
      );

      const respData = preOrderResponse.data;
      logger.info('抖音预下单响应:', JSON.stringify(respData));
      
      if (respData.err_no !== 0 || !respData.data) {
        const errorMsg = respData.err_tips || respData.message || respData.err_msg || '未知错误';
        logger.error(`❌ 抖音预下单失败: err_no=${respData.err_no}, ${errorMsg}`);
        throw new Error(`抖音预下单失败: ${errorMsg}`);
      }

      const payInfo = {
        order_id: respData.data.order_id,
        order_token: respData.data.order_token
      };

      logger.info('✅ 支付参数生成成功');
      
      // 返回支付参数给前端
      logger.info('========================================');
      logger.info('📤 步骤: 返回支付参数给前端');
      logger.info('========================================');
      logger.info('返回数据:', {
        orderId,
        amount,
        credits,
        payInfo: { ...payInfo, sign: '***' }
      });

      res.json({
        code: 'SUCCESS',
        message: '订单创建成功',
        data: {
          orderId,
          amount,
          credits,
          payInfo
        }
      });

      logger.info('🎉 订单创建流程完成！');
      logger.info('========================================');
      
    } catch (apiError) {
      logger.error('❌ 调用抖音支付API失败:', {
        message: apiError.message,
        response: apiError.response?.data,
        status: apiError.response?.status
      });
      
      // 如果是网络错误或API错误，返回详细错误信息
      if (apiError.response && apiError.response.data) {
        const errorData = apiError.response.data;
        throw new Error(`抖音支付API错误: ${errorData.err_tips || errorData.message || errorData.err_msg || apiError.message}`);
      }
      throw apiError;
    }

  } catch (error) {
    logger.error('========================================');
    logger.error('❌ 创建抖音充值订单失败:', error);
    logger.error('========================================');
    res.status(500).json({
      error: '创建订单失败',
      code: 'CREATE_ORDER_ERROR',
      message: error.message
    });
  }
});

/**
 * 抖音支付回调接口
 * POST /api/douyin/pay/notify
 * 注意：需要根据抖音支付文档实现验签和回调处理
 */
router.post('/notify', express.json(), async (req, res) => {
  try {
    logger.info('========================================');
    logger.info('📥 收到抖音支付回调通知');
    logger.info('========================================');
    logger.info('回调Headers:', JSON.stringify(req.headers, null, 2));
    logger.info('回调Body:', JSON.stringify(req.body, null, 2));

    // 1. 验签（使用抖音后台配置的 Token 校验 msg_signature）
    const token = process.env.DOUYIN_PAY_TOKEN;
    const { msg_signature: msgSignature, timestamp, nonce } = req.query || {};

    if (!token) {
      logger.error('❌ 未配置 DOUYIN_PAY_TOKEN，无法验签');
      return res.json({ code: 'FAIL', message: '未配置回调Token' });
    }

    if (!msgSignature || !timestamp || !nonce) {
      logger.error('❌ 回调缺少签名参数');
      return res.json({ code: 'FAIL', message: '缺少签名参数' });
    }

    const crypto = require('crypto');
    const raw = [token, timestamp, nonce].sort().join('');
    const expected = crypto.createHash('sha1').update(raw).digest('hex');

    if (expected !== msgSignature) {
      logger.error('❌ 回调签名校验失败', { expected, msgSignature });
      return res.json({ code: 'FAIL', message: '验签失败' });
    }

    // 2. 解析回调数据
    // 抖音支付回调数据格式可能为：
    // - req.body.out_trade_no 或 req.body.outTradeNo (商户订单号)
    // - req.body.transaction_id 或 req.body.transactionId (抖音订单号)
    // - req.body.amount 或 req.body.total_amount (支付金额，单位：分)
    // - req.body.status 或 req.body.trade_status (支付状态)
    
    const outTradeNo = req.body.out_trade_no || req.body.outTradeNo || req.body.out_order_no;
    const transactionId = req.body.transaction_id || req.body.transactionId || req.body.order_id;
    const amount = req.body.amount || req.body.total_amount || req.body.pay_amount;
    const tradeStatus = req.body.status || req.body.trade_status || req.body.pay_status;
    
    logger.info('回调数据解析:', {
      outTradeNo,
      transactionId,
      amount,
      tradeStatus,
      rawBody: JSON.stringify(req.body)
    });
    
    if (!outTradeNo) {
      logger.error('❌ 回调数据缺少商户订单号');
      return res.json({ code: 'FAIL', message: '缺少订单号' });
    }
    
    // 检查支付状态（如果回调中包含状态信息）
    if (tradeStatus && tradeStatus !== 'SUCCESS' && tradeStatus !== 'success' && tradeStatus !== 'PAID') {
      logger.warn(`⚠️  订单状态异常: ${tradeStatus}, 商户订单号: ${outTradeNo}`);
      // 非成功状态也返回成功，避免抖音重复回调
      return res.json({ code: 'SUCCESS', message: '已接收回调' });
    }

    // 从商户订单号中提取订单ID（格式：DOUYINtimestamp000001）
    // 支持两种格式：
    // 1. DOUYINtimestamp000001 - 提取最后6位
    // 2. 如果格式不匹配，尝试通过 out_trade_no 查询订单
    let orderId;
    if (outTradeNo.startsWith('DOUYIN')) {
      const orderIdStr = outTradeNo.replace('DOUYIN', '').slice(-6);
      orderId = parseInt(orderIdStr);
    } else {
      // 如果不是标准格式，尝试通过商户订单号直接查询
      const ordersByOutTradeNo = await query(
        'SELECT id FROM payment_orders WHERE out_trade_no = ?',
        [outTradeNo]
      );
      if (ordersByOutTradeNo.length > 0) {
        orderId = ordersByOutTradeNo[0].id;
      } else {
        logger.error('❌ 无法从商户订单号提取订单ID:', outTradeNo);
        return res.json({ code: 'FAIL', message: '订单号格式错误' });
      }
    }

    logger.info(`✅ 回调验证成功`);
    logger.info(`   商户订单号: ${outTradeNo}`);
    logger.info(`   订单ID: ${orderId}`);
    logger.info(`   抖音订单号: ${transactionId}`);

    // 查询订单
    const orders = await query(
      'SELECT * FROM payment_orders WHERE id = ?',
      [orderId]
    );

    if (orders.length === 0) {
      logger.error('❌ 订单不存在:', orderId);
      return res.json({ code: 'FAIL', message: '订单不存在' });
    }

    const order = orders[0];
    logger.info(`📦 订单信息: 用户${order.user_id}, 积分${order.credits}, 金额¥${order.amount}`);

    // 验证金额（如果回调中包含金额信息）
    if (amount) {
      const expectedAmount = Math.round(order.amount * 100); // 订单金额转为分
      const actualAmount = typeof amount === 'number' ? amount : parseInt(amount);
      if (Math.abs(actualAmount - expectedAmount) > 1) { // 允许1分误差
        logger.error(`❌ 金额不匹配: 订单金额=${expectedAmount}分, 回调金额=${actualAmount}分`);
        return res.json({ code: 'FAIL', message: '金额不匹配' });
      }
      logger.info(`✅ 金额验证通过: ${actualAmount}分`);
    }

    // 防止重复处理
    if (order.status === 'paid') {
      logger.info('⚠️  订单已处理，直接返回成功');
      return res.json({ code: 'SUCCESS', message: '订单已处理' });
    }

    // 使用事务处理支付成功（复用微信支付的防重逻辑）
    logger.info('🔄 开始处理订单...');
    let alreadyProcessed = false;
    
    try {
      await transaction(async (conn) => {
        // 1. 锁定用户记录
        const [userRows] = await conn.execute(
          'SELECT has_used_first_recharge FROM users WHERE id = ? FOR UPDATE',
          [order.user_id]
        );

        if (!userRows.length) {
          throw new Error(`未找到用户 ${order.user_id}`);
        }

        const hasUsedFirstRecharge = userRows[0].has_used_first_recharge === 1;
        const creditPlan = calculateCredits(order.package_id, hasUsedFirstRecharge);
        const finalCredits = creditPlan.totalCredits;
        const grantFirstRechargeBonus = order.is_first_recharge && !hasUsedFirstRecharge && creditPlan.isFirstRecharge;

        // 2. 防重处理：尝试更新订单状态
        const [updateResult] = await conn.execute(
          'UPDATE payment_orders SET status = ?, trade_no = ?, paid_at = NOW(), credits = ? WHERE id = ? AND status = ?',
          ['paid', transactionId, finalCredits, orderId, 'pending']
        );
        
        if (updateResult.affectedRows === 0) {
          logger.warn(`   ⚠️ 订单${orderId}已被其他请求处理，跳过重复发放`);
          alreadyProcessed = true;
          return;
        }
        
        logger.info('   ✓ 订单状态已更新为已支付');

        // 3. 更新首充标记
        if (grantFirstRechargeBonus) {
          await conn.execute(
            'UPDATE users SET has_used_first_recharge = 1 WHERE id = ?',
            [order.user_id]
          );
          logger.info('   ✓ 首充标记已更新');
        }

        // 4. 增加用户积分
        await conn.execute(
          'UPDATE user_credits SET credits = credits + ?, total_earned = total_earned + ? WHERE user_id = ?',
          [finalCredits, finalCredits, order.user_id]
        );
        logger.info(`   ✓ 用户积分已增加: +${finalCredits}`);

        // 5. 查询最新积分余额
        const [creditRows] = await conn.execute(
          'SELECT credits FROM user_credits WHERE user_id = ?',
          [order.user_id]
        );
        const finalBalance = creditRows[0]?.credits || 0;

        // 6. 记录积分流水
        await conn.execute(
          `INSERT INTO credit_transactions (user_id, type, amount, balance_after, source, description, created_at)
           VALUES (?, 'recharge', ?, ?, 'douyin_pay', ?, NOW())`,
          [
            order.user_id,
            finalCredits,
            finalBalance,
            grantFirstRechargeBonus 
              ? `抖音支付充值+首充奖励（订单${outTradeNo}）`
              : `抖音支付充值（订单${outTradeNo}）`
          ]
        );
        logger.info('   ✓ 积分流水已记录');
      });

      if (alreadyProcessed) {
        return res.json({ code: 'SUCCESS', message: '订单已处理' });
      }

      logger.info('✅ 订单处理完成');
      return res.json({ code: 'SUCCESS', message: '处理成功' });

    } catch (txError) {
      logger.error('❌ 订单处理失败:', txError);
      return res.json({ code: 'FAIL', message: '处理失败' });
    }

  } catch (error) {
    logger.error('========================================');
    logger.error('❌ 抖音支付回调处理失败:', error);
    logger.error('========================================');
    return res.json({ code: 'FAIL', message: '处理失败' });
  }
});

/**
 * 检查是否已使用首充优惠
 * GET /api/douyin/pay/check-first-recharge
 */
router.get('/check-first-recharge', async (req, res) => {
  try {
    const userId = req.user.id;

    const users = await query(
      'SELECT has_used_first_recharge FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        error: '用户不存在',
        code: 'USER_NOT_FOUND'
      });
    }

    const hasFirstRecharge = users[0].has_used_first_recharge === 1;

    res.json({
      code: 'SUCCESS',
      data: {
        hasFirstRecharge
      }
    });

  } catch (error) {
    logger.error('检查首充状态失败:', error);
    res.status(500).json({
      error: '检查首充状态失败',
      code: 'CHECK_FIRST_RECHARGE_ERROR',
      message: error.message
    });
  }
});

/**
 * 查询订单状态（主动查询）
 * POST /api/douyin/pay/query-and-complete
 * 复用微信支付的逻辑，前端支付成功后立即调用此接口
 */
router.post('/query-and-complete', [
  body('orderId').isInt().withMessage('订单ID必须是整数')
], async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.body;

    logger.info(`🔍 查询抖音支付订单: ${orderId}, 用户: ${userId}`);

    const orders = await query(
      'SELECT * FROM payment_orders WHERE id = ? AND user_id = ?',
      [orderId, userId]
    );

    if (orders.length === 0) {
      return res.status(404).json({
        error: '订单不存在',
        code: 'ORDER_NOT_FOUND'
      });
    }

    const order = orders[0];

    // 如果订单已支付，直接返回
    if (order.status === 'paid') {
      const [creditRows] = await query(
        'SELECT credits FROM user_credits WHERE user_id = ?',
        [userId]
      );
      const balance = creditRows[0]?.credits || 0;

      return res.json({
        code: 'SUCCESS',
        message: '订单已完成',
        data: {
          status: 'paid',
          credits: order.credits,
          balance
        }
      });
    }

    // 调用抖音支付查单接口
    try {
      const douyinAppId = process.env.DOUYIN_APP_ID;
      const douyinMerchantId = process.env.DOUYIN_MERCHANT_ID;
      const douyinSalt = process.env.DOUYIN_PAY_SALT;
      
      if (!douyinAppId || !douyinMerchantId || !douyinSalt) {
        logger.warn('⚠️  未配置抖音支付，无法查询订单状态');
        return res.json({
          code: 'PENDING',
          message: '订单处理中，请稍后查看',
          data: {
            status: order.status
          }
        });
      }
      
      // 构建查询参数
      const queryParams = {
        app_id: douyinAppId,
        merchant_id: douyinMerchantId,
        out_order_no: order.out_trade_no
      };
      
      // 生成签名
      const sign = generateDouyinSign(queryParams, douyinSalt);
      queryParams.sign = sign;
      
      // 调用抖音支付查询接口
      const axios = require('axios');
      const queryResponse = await axios.post(
        'https://open.douyin.com/pay/v2/query_order',
        queryParams,
        { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
      );
      
      const queryData = queryResponse.data;
      logger.info('抖音支付查询结果:', JSON.stringify(queryData));
      
      if (queryData.err_no === 0 && queryData.data) {
        const payStatus = queryData.data.status;
        
        // 如果订单已支付，更新订单状态
        if (payStatus === 'SUCCESS' || payStatus === 'success' || payStatus === 'PAID') {
          if (order.status !== 'paid') {
            // 订单已支付但未更新，触发支付成功处理
            logger.info('🔔 查询发现订单已支付，触发支付成功处理');
            // 返回给前端，让前端知道订单已支付，但需要等待回调处理
            const [creditRows] = await query(
              'SELECT credits FROM user_credits WHERE user_id = ?',
              [userId]
            );
            const balance = creditRows[0]?.credits || 0;
            
            return res.json({
              code: 'SUCCESS',
              message: '订单已支付，正在处理中',
              data: {
                status: 'paid',
                credits: order.credits,
                balance
              }
            });
          }
        }
        
        // 查询用户当前积分余额
        const [creditRows] = await query(
          'SELECT credits FROM user_credits WHERE user_id = ?',
          [userId]
        );
        const balance = creditRows[0]?.credits || 0;
        
        return res.json({
          code: 'SUCCESS',
          message: '查询成功',
          data: {
            status: payStatus === 'SUCCESS' || payStatus === 'success' || payStatus === 'PAID' ? 'paid' : order.status,
            credits: order.status === 'paid' ? order.credits : 0,
            balance
          }
        });
      } else {
        logger.warn('抖音支付查询失败:', queryData.err_tips || queryData.message);
        return res.json({
          code: 'PENDING',
          message: '订单处理中，请稍后查看',
          data: {
            status: order.status
          }
        });
      }
    } catch (queryError) {
      logger.error('查询抖音支付订单失败:', queryError);
      return res.json({
        code: 'PENDING',
        message: '订单处理中，请稍后查看',
        data: {
          status: order.status
        }
      });
    }

  } catch (error) {
    logger.error('查询抖音支付订单失败:', error);
    res.status(500).json({
      error: '查询订单失败',
      code: 'QUERY_ERROR',
      message: error.message
    });
  }
});

module.exports = router;

