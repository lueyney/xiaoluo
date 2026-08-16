const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const logger = require('./utils/logger');
const db = require('./config/database');
const fs = require('fs').promises;
const errorHandler = require('./middleware/errorHandler');
const adminRoutes = require('../backmager/routes');
const adminRequestContext = require('../backmager/middleware/requestContext');

// 路由
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const documentRoutes = require('./routes/document');
const orderRoutes = require('./routes/order');
const notificationRoutes = require('./routes/notification');
const writingRoutes = require('./routes/writing');
const rewriteRoutes = require('./routes/rewrite');
const wheelRoutes = require('./routes/wheel');
const titleGeneratorRoutes = require('./routes/title-generator');
const wechatPayRoutes = require('./routes/wechat-pay');
const documentExportRoutes = require('./routes/document-export');
const documentRewriteJobRoutes = require('./routes/document-rewrite-jobs');
const douyinAuthRoutes = require('./routes/douyin-auth');
const douyinPayRoutes = require('./routes/douyin-pay');
const { startCleanupJob } = require('./utils/cleanup-orders');
const { query, transaction } = require('./config/database');

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const TRUST_PROXY = process.env.TRUST_PROXY === 'false' ? false : true;

// 文档降重直接复用原 AI 降重路由已经使用的句子处理管线。
// 只在文档任务中替换回原 DOCX，不改变 /api/rewrite 的路由行为。
app.locals.documentRewritePipeline = rewriteRoutes.documentRewritePipeline;
app.locals.documentRewriteCharge = async (job) => {
  const creditsCost = Number(job.creditsCost) || 0;
  if (creditsCost <= 0) return;
  await transaction(async (connection) => {
    const [rows] = await connection.execute(
      'SELECT credits FROM user_credits WHERE user_id = ? FOR UPDATE',
      [job.userId]
    );
    const available = Number(rows[0] && rows[0].credits) || 0;
    if (available < creditsCost) {
      const error = new Error(`积分不足，文档降重需要 ${creditsCost} 积分，当前仅有 ${available} 积分`);
      error.code = 'INSUFFICIENT_CREDITS';
      error.required = creditsCost;
      error.available = available;
      throw error;
    }
    const balanceAfter = available - creditsCost;
    await connection.execute(
      'UPDATE user_credits SET credits = credits - ?, total_consumed = total_consumed + ? WHERE user_id = ?',
      [creditsCost, creditsCost, job.userId]
    );
    await connection.execute(
      'INSERT INTO credit_transactions (user_id, type, amount, balance_after, source, description) VALUES (?, ?, ?, ?, ?, ?)',
      [job.userId, 'consume', creditsCost, balanceAfter, 'ai_rewrite', `文档降重：${job.wordCount}字`]
    );
  });
};
app.locals.documentRewriteSave = async (job) => {
  const content = String(job.rewrittenText || '').trim();
  if (!content || !job.outputPath) return;

  // AI降重稿必须关联原位替换后的 DOCX。该目录不受任务临时文件 TTL 清理影响。
  const libraryDir = path.join(__dirname, 'data', 'document-library');
  const libraryFileName = `${job.id}.docx`;
  const libraryPath = path.join(libraryDir, libraryFileName);
  await fs.mkdir(libraryDir, { recursive: true });
  await fs.copyFile(job.outputPath, libraryPath);

  await query(
    'INSERT INTO documents (user_id, title, content, type, field, word_count, credits_cost, rewrite_docx_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [job.userId, job.fileName.replace(/\.docx$/iu, ''), content, 'AI降重', '', content.length, job.creditsCost || 0, path.join('data', 'document-library', libraryFileName)]
  );
};

app.set('trust proxy', TRUST_PROXY);

app.use(helmet(IS_PRODUCTION
  ? {
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }
  : {
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    }
));

function normalizeOrigin(origin) {
  return (origin || '').trim().replace(/\/$/, '');
}

function getAllowedOrigins() {
  const configured = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);

  const publicBaseUrl = normalizeOrigin(process.env.PUBLIC_BASE_URL || '');
  if (publicBaseUrl && !configured.includes(publicBaseUrl)) {
    configured.push(publicBaseUrl);
  }

  if (IS_PRODUCTION && configured.length === 0) {
    logger.warn('生产环境未配置 ALLOWED_ORIGINS，浏览器跨域请求将被拒绝');
  }

  return configured;
}

const corsOptions = {
  origin: IS_PRODUCTION
    ? (origin, callback) => {
        const allowedOrigins = getAllowedOrigins();
        const requestOrigin = normalizeOrigin(origin);

        if (!origin) {
          return callback(null, true);
        }

        if (allowedOrigins.includes(requestOrigin)) {
          return callback(null, true);
        }

        logger.warn(`CORS来源被拒绝: ${origin}; allowlist=${allowedOrigins.join(',') || '(empty)'}`);
        return callback(null, false);
      }
    : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
  maxAge: 86400
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

if (IS_PRODUCTION && process.env.PUBLIC_BASE_URL) {
  const publicBaseUrl = normalizeOrigin(process.env.PUBLIC_BASE_URL);
  app.use((req, res, next) => {
    if (!req.secure && req.get('x-forwarded-proto') !== 'https') {
      return res.redirect(301, `${publicBaseUrl}${req.originalUrl}`);
    }
    return next();
  });
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
  keyGenerator: (req) => req.ip,
  // A document job keeps running in the background. Its progress GETs are
  // deliberately handled by the dedicated poll limiter below, otherwise a
  // normal 1-3 second UI poll loop exhausts this business-wide budget.
  skip: (req) => (
    (req.method === 'GET' && /^\/document-rewrite-jobs\/[^/]+$/.test(req.path))
    || req.path === '/wechat-pay/create-web-order'
  ),
  handler: (req, res) => {
    const resetAt = req.rateLimit && req.rateLimit.resetTime instanceof Date
      ? req.rateLimit.resetTime.getTime()
      : Date.now() + 60 * 1000;
    res.set('Retry-After', String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))));
    res.status(429).json({
      error: '请求过于频繁，请稍后重试',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  },
  message: {
    error: '请求过于频繁，请稍后重试',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

// Progress reads are cheap and do not create work, charge credits, or call
// DeepSeek. Keep them separate from the stricter business API limiter. The
// route-specific condition prevents this relaxed budget from applying to the
// upload/creation POST or to arbitrary job endpoints.
const documentRewritePollLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    const resetAt = req.rateLimit && req.rateLimit.resetTime instanceof Date
      ? req.rateLimit.resetTime.getTime()
      : Date.now() + 60 * 1000;
    res.set('Retry-After', String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))));
    res.status(429).json({
      error: '进度查询过于频繁，请稍后重试',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }
});

const createWebOrderLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
  keyGenerator: (req) => req.ip,
  message: {
    error: '请求过于频繁，请稍后重试',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});
app.use('/api/wechat-pay/create-web-order', createWebOrderLimiter);
app.use('/api/document-rewrite-jobs', (req, res, next) => {
  if (req.method === 'GET' && /^\/[^/]+$/.test(req.path)) {
    return documentRewritePollLimiter(req, res, next);
  }
  return next();
});
app.use('/api/', limiter);

app.use('/api/wechat-pay/notify', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(adminRequestContext());

app.use((req, res, next) => {
  if (!IS_PRODUCTION) {
    logger.info(`${req.method} ${req.path} - ${req.ip}`);
  }
  next();
});

const staticDir = path.join(__dirname, 'exports');
app.use('/static', express.static(staticDir, {
  maxAge: '7d',
  index: false
}));

const webFrontendDir = path.join(__dirname, '../web-frontend');
app.use(express.static(webFrontendDir, {
  maxAge: '0',
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.html') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  },
  index: 'index.html'
}));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    port: PORT
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/writing', writingRoutes);
app.use('/api/rewrite', rewriteRoutes);
app.use('/api/wheel', wheelRoutes);
app.use('/api/title-generator', titleGeneratorRoutes);
app.use('/api/wechat-pay', wechatPayRoutes);
app.use('/api/document-export', documentExportRoutes);
app.use('/api/document-rewrite-jobs', documentRewriteJobRoutes);
app.use('/api/douyin/auth', douyinAuthRoutes);
app.use('/api/douyin/pay', douyinPayRoutes);
app.use('/api/admin', adminRoutes);

app.use('*', (req, res) => {
  res.status(404).json({
    error: '接口不存在',
    code: 'NOT_FOUND',
    path: req.originalUrl
  });
});

app.use(errorHandler);

const server = app.listen(PORT, '0.0.0.0', async () => {
  console.log('========================================');
  console.log('🚀 后端服务启动成功');
  console.log('========================================');
  console.log(`端口: ${PORT}`);
  console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Web入口: http://localhost:${PORT}`);
  console.log(`API入口: http://localhost:${PORT}/api`);
  console.log(`健康检查: http://localhost:${PORT}/health`);
  console.log('========================================');
  console.log('');

  logger.info(`后端服务已启动: ${PORT}`);
  logger.info(`运行环境: ${process.env.NODE_ENV || 'development'}`);

  startCleanupJob();

  try {
    // 确保 payment_orders 存在（支付订单记录依赖）
    await query(`
      CREATE TABLE IF NOT EXISTS payment_orders (
        id BIGINT(20) NOT NULL AUTO_INCREMENT,
        user_id BIGINT(20) NOT NULL,
        package_id INT(11) DEFAULT NULL,
        amount DECIMAL(10,2) NOT NULL,
        credits INT(11) NOT NULL,
        is_first_recharge TINYINT(1) DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        out_trade_no VARCHAR(64) DEFAULT NULL,
        trade_no VARCHAR(64) DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        paid_at TIMESTAMP NULL DEFAULT NULL,
        PRIMARY KEY (id),
        KEY idx_payment_orders_user (user_id),
        KEY idx_payment_orders_status (status),
        KEY idx_payment_orders_out_trade_no (out_trade_no)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const payCols = [
      { name: 'is_first_recharge', ddl: 'ALTER TABLE payment_orders ADD COLUMN is_first_recharge TINYINT(1) DEFAULT 0' },
      { name: 'out_trade_no', ddl: 'ALTER TABLE payment_orders ADD COLUMN out_trade_no VARCHAR(64) DEFAULT NULL' },
      { name: 'updated_at', ddl: 'ALTER TABLE payment_orders ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
      { name: 'paid_at', ddl: 'ALTER TABLE payment_orders ADD COLUMN paid_at TIMESTAMP NULL DEFAULT NULL' }
    ];

    for (const col of payCols) {
      const rows = await query(
        `SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_orders' AND COLUMN_NAME = ?`,
        [col.name]
      );
      if (rows[0].cnt === 0) {
        await query(col.ddl);
      }
    }

    // 兼容 orders 结果字段
    const orderCols = [
      { name: 'result_content', ddl: 'ALTER TABLE orders ADD COLUMN result_content LONGTEXT DEFAULT NULL' },
      { name: 'failure_reason', ddl: 'ALTER TABLE orders ADD COLUMN failure_reason VARCHAR(500) DEFAULT NULL' },
      { name: 'finished_at', ddl: 'ALTER TABLE orders ADD COLUMN finished_at DATETIME DEFAULT NULL' },
      { name: 'success_count', ddl: 'ALTER TABLE orders ADD COLUMN success_count INT DEFAULT 0' },
      { name: 'fail_count', ddl: 'ALTER TABLE orders ADD COLUMN fail_count INT DEFAULT 0' }
    ];

    for (const col of orderCols) {
      const rows = await query(
        `SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = ?`,
        [col.name]
      );
      if (rows[0].cnt === 0) {
        await query(col.ddl);
      }
    }

    // AI降重稿保存原位替换后的 DOCX，文档库导出时直接返回该文件。
    const documentCols = [
      { name: 'rewrite_docx_path', ddl: 'ALTER TABLE documents ADD COLUMN rewrite_docx_path VARCHAR(500) DEFAULT NULL' }
    ];
    for (const col of documentCols) {
      const rows = await query(
        `SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = ?`,
        [col.name]
      );
      if (rows[0].cnt === 0) {
        await query(col.ddl);
      }
    }

    logger.info('[迁移] 订单相关表结构检查完成');
  } catch (e) {
    logger.warn(`[迁移] 启动迁移异常: ${e.message}`);
  }
});

process.on('SIGTERM', () => {
  logger.info('收到SIGTERM，准备关闭服务...');
  server.close(() => {
    logger.info('服务已关闭');
    if (db.pool && typeof db.pool.end === 'function') {
      db.pool.end();
    }
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('收到SIGINT，准备关闭服务...');
  server.close(() => {
    logger.info('服务已关闭');
    if (db.pool && typeof db.pool.end === 'function') {
      db.pool.end();
    }
    process.exit(0);
  });
});

module.exports = app;
