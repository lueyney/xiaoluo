const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const requestContext = require('./middleware/requestContext');
const adminRoutes = require('./routes');

const app = express();

// proxy-aware IP resolution for rate limiter and audit logs
app.set('trust proxy', true);

app.use(helmet());

app.use(cors({
  origin: process.env.ADMIN_CORS_ORIGINS ? process.env.ADMIN_CORS_ORIGINS.split(',') : true,
  credentials: true
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
  keyGenerator: (req) => req.ip,
  message: {
    error: 'Too many requests, please try again later',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});
app.use('/api/admin', limiter);

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(requestContext());

app.use((req, res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    requestId: req.requestId
  });
  next();
});

app.get('/admin/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'miniapp-admin-backend',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    path: req.originalUrl
  });
});

app.use(errorHandler);

module.exports = app;

