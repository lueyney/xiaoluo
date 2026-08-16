const db = require('../config/database');

async function getOverview () {
  const [[userCount]] = await db.pool.query('SELECT COUNT(*) AS total_users FROM users');
  const [[activeUsers]] = await db.pool.query('SELECT COUNT(*) AS active_users FROM users WHERE status = 1');
  const [[documentCount]] = await db.pool.query('SELECT COUNT(*) AS total_documents FROM documents');
  const [[orderStats]] = await db.pool.query(
    `SELECT
        COUNT(*) AS total_orders,
        SUM(amount) AS total_amount,
        SUM(credits) AS total_credits
     FROM orders
     WHERE status = 'completed'`
  );
  const [[paymentStats]] = await db.pool.query(
    `SELECT
        SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS paid_amount,
        SUM(CASE WHEN status = 'paid' THEN credits ELSE 0 END) AS paid_credits
     FROM payment_orders`
  );
  const [[todayStats]] = await db.pool.query(
    `SELECT
        COUNT(*) AS today_users,
        SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS today_new_users
     FROM users`
  );
  const [[creditsStats]] = await db.pool.query(
    `SELECT
        SUM(credits) AS total_balance,
        SUM(total_earned) AS total_earned,
        SUM(total_consumed) AS total_consumed
     FROM user_credits`
  );

  return {
    totalUsers: userCount.total_users || 0,
    activeUsers: activeUsers.active_users || 0,
    inactiveUsers: (userCount.total_users || 0) - (activeUsers.active_users || 0),
    todayNewUsers: Number(todayStats.today_new_users || 0),
    totalDocuments: documentCount.total_documents || 0,
    totalOrders: orderStats.total_orders || 0,
    totalRevenue: Number(orderStats.total_amount || 0),
    totalCreditsSold: Number(orderStats.total_credits || 0),
    totalPaidAmount: Number(paymentStats.paid_amount || 0),
    totalPaidCredits: Number(paymentStats.paid_credits || 0),
    currentCreditsBalance: Number(creditsStats.total_balance || 0),
    totalCreditsEarned: Number(creditsStats.total_earned || 0),
    totalCreditsConsumed: Number(creditsStats.total_consumed || 0)
  };
}

async function getDailySummary (days = 7) {
  const safeDays = normalizeDays(days);
  const [rows] = await db.pool.query(
    `SELECT DATE(created_at) AS day,
            COUNT(DISTINCT user_id) AS new_users,
            SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) AS revenue,
            SUM(CASE WHEN status = 'completed' THEN credits ELSE 0 END) AS credits
     FROM orders
     WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(created_at)
     ORDER BY day DESC`,
    [safeDays]
  );
  return rows;
}

async function getCharts (days = 7) {
  const safeDays = normalizeDays(days);
  const [userGrowthRows] = await db.pool.query(
    `WITH RECURSIVE dates AS (
       SELECT DATE_SUB(CURDATE(), INTERVAL ? - 1 DAY) AS day
       UNION ALL
       SELECT DATE_ADD(day, INTERVAL 1 DAY)
       FROM dates
       WHERE day < CURDATE()
     )
     SELECT DATE_FORMAT(d.day, '%Y-%m-%d') AS day,
            COALESCE(new_users.total, 0) AS newUsers,
            COALESCE(active_users.total, 0) AS activeUsers,
            (
              SELECT COUNT(*)
              FROM users u_total
              WHERE DATE(u_total.created_at) <= d.day
            ) AS cumulativeUsers
     FROM dates d
     LEFT JOIN (
       SELECT DATE(created_at) AS day, COUNT(*) AS total
       FROM users
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? - 1 DAY)
       GROUP BY DATE(created_at)
     ) new_users ON new_users.day = d.day
     LEFT JOIN (
       SELECT DATE(created_at) AS day, COUNT(DISTINCT user_id) AS total
       FROM orders
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? - 1 DAY)
       GROUP BY DATE(created_at)
     ) active_users ON active_users.day = d.day
     ORDER BY d.day ASC`,
    [safeDays, safeDays, safeDays]
  );

  const [userClickRows] = await db.pool.query(
    `WITH RECURSIVE dates AS (
       SELECT DATE_SUB(CURDATE(), INTERVAL ? - 1 DAY) AS day
       UNION ALL
       SELECT DATE_ADD(day, INTERVAL 1 DAY)
       FROM dates
       WHERE day < CURDATE()
     )
     SELECT DATE_FORMAT(d.day, '%Y-%m-%d') AS day,
            COALESCE(click_stats.documentClicks, 0) AS documentClicks,
            COALESCE(click_stats.orderClicks, 0) AS orderClicks,
            COALESCE(click_stats.paymentClicks, 0) AS paymentClicks,
            COALESCE(click_stats.totalClicks, 0) AS totalClicks
     FROM dates d
     LEFT JOIN (
       SELECT DATE(created_at) AS day,
              SUM(CASE WHEN source = 'ai_writing' THEN 1 ELSE 0 END) AS documentClicks,
              SUM(CASE WHEN source = 'order' THEN 1 ELSE 0 END) AS orderClicks,
              SUM(CASE WHEN source = 'recharge' THEN 1 ELSE 0 END) AS paymentClicks,
              COUNT(*) AS totalClicks
       FROM credit_transactions
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? - 1 DAY)
       GROUP BY DATE(created_at)
     ) click_stats ON click_stats.day = d.day
     ORDER BY d.day ASC`,
    [safeDays, safeDays]
  );

  const [pointsRows] = await db.pool.query(
    `SELECT u.id AS userId,
            COALESCE(NULLIF(u.nickname, ''), u.phone, CONCAT('用户', u.id)) AS userLabel,
            COALESCE(c.credits, 0) AS credits,
            COALESCE(c.total_earned, 0) AS totalEarned,
            COALESCE(c.total_consumed, 0) AS totalConsumed
     FROM users u
     LEFT JOIN user_credits c ON c.user_id = u.id
     ORDER BY COALESCE(c.credits, 0) DESC, u.id ASC
     LIMIT 10`
  );

  return {
    rangeDays: safeDays,
    userGrowth: userGrowthRows,
    userClicks: userClickRows,
    pointsLeaderboard: pointsRows
  };
}

function normalizeDays (days) {
  const parsed = Number(days);
  if (!Number.isFinite(parsed)) {
    return 7;
  }
  return Math.min(Math.max(Math.floor(parsed), 1), 90);
}

module.exports = {
  getOverview,
  getDailySummary,
  getCharts
};
