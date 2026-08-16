/**
 * 定时任务：清理超时的 pending 订单
 * - 每10分钟执行一次
 * - 超过2小时的 pending 订单：向微信主动查单，已支付则补发积分，未支付则标记 cancelled
 */
const { query, transaction } = require('../config/database');
const logger = require('../utils/logger');
const wechatPayV3 = require('../utils/wechat-pay-v3');

const TIMEOUT_HOURS = 2;       // 超过2小时视为超时
const INTERVAL_MS = 10 * 60 * 1000; // 10分钟执行一次

async function cleanupPendingOrders() {
  try {
    // 查找超时的 pending 订单
    const rows = await query(
      `SELECT id, user_id, package_id, amount, credits, out_trade_no, is_first_recharge
       FROM payment_orders
       WHERE status = 'pending'
         AND created_at < DATE_SUB(NOW(), INTERVAL ? HOUR)
         AND out_trade_no IS NOT NULL`,
      [TIMEOUT_HOURS]
    );

    if (rows.length === 0) return;

    logger.info(`[定时任务] 发现 ${rows.length} 条超时 pending 订单，开始处理`);

    for (const order of rows) {
      try {
        const result = await wechatPayV3.queryOrder(order.out_trade_no);

        if (result.success && result.tradeState === 'SUCCESS') {
          // 微信已支付，补发积分
          logger.info(`[定时任务] 订单 ${order.id} 微信已支付，补发积分`);
          await transaction(async (conn) => {
            const [upd] = await conn.execute(
              `UPDATE payment_orders SET status='paid', trade_no=?, paid_at=NOW() WHERE id=? AND status='pending'`,
              [result.transactionId, order.id]
            );
            if (upd.affectedRows === 0) return;

            if (order.is_first_recharge) {
              await conn.execute('UPDATE users SET has_used_first_recharge=1 WHERE id=?', [order.user_id]);
            }
            await conn.execute(
              'UPDATE user_credits SET credits=credits+?, total_earned=total_earned+? WHERE user_id=?',
              [order.credits, order.credits, order.user_id]
            );
            const [[uc]] = await conn.execute('SELECT credits FROM user_credits WHERE user_id=?', [order.user_id]);
            await conn.execute(
              `INSERT INTO credit_transactions (user_id,type,amount,balance_after,source,description,created_at)
               VALUES (?,'earn',?,?,'recharge',?,NOW())`,
              [order.user_id, order.credits, uc.credits, `定时补发：充值¥${order.amount}获得${order.credits}积分`]
            );
            logger.info(`[定时任务] 订单 ${order.id} 补发成功：用户${order.user_id} +${order.credits}积分`);
          });

        } else {
          // 未支付或微信侧已关闭，标记 cancelled
          const tradeState = result.success ? result.tradeState : 'QUERY_FAILED';
          logger.info(`[定时任务] 订单 ${order.id} 状态=${tradeState}，标记 cancelled`);
          await query(
            `UPDATE payment_orders SET status='cancelled' WHERE id=? AND status='pending'`,
            [order.id]
          );
        }
      } catch (e) {
        logger.error(`[定时任务] 处理订单 ${order.id} 异常:`, e.message);
      }
    }
  } catch (e) {
    logger.error('[定时任务] cleanupPendingOrders 异常:', e.message);
  }
}

/**
 * 启动定时任务（在 app.js 中调用此函数）
 */
function startCleanupJob() {
  logger.info(`[定时任务] 启动 pending 订单清理任务，间隔 ${INTERVAL_MS / 60000} 分钟`);
  // 启动后延迟1分钟首次执行，避免启动瞬间大量请求
  setTimeout(() => {
    cleanupPendingOrders();
    setInterval(cleanupPendingOrders, INTERVAL_MS);
  }, 60 * 1000);
}

module.exports = { startCleanupJob, cleanupPendingOrders };
