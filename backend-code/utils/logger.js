const winston = require('winston');
const path = require('path');
const fs = require('fs');

// 创建日志目录
const logDir = 'logs';

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const isProduction = process.env.NODE_ENV === 'production';
const resolvedLogLevel = process.env.LOG_LEVEL || (isProduction ? 'error' : 'info');
const enableConsoleLog = process.env.ENABLE_CONSOLE_LOG
  ? process.env.ENABLE_CONSOLE_LOG !== 'false'
  : !isProduction;

// 定义日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// 创建logger实例
const logger = winston.createLogger({
  level: resolvedLogLevel,
  format: logFormat,
  defaultMeta: { service: 'lunjun-backend' },
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5
    })
  ]
});

if (!isProduction) {
  logger.add(new winston.transports.File({
    filename: path.join(logDir, 'combined.log'),
    maxsize: 5242880,
    maxFiles: 5
  }));
}

if (enableConsoleLog) {
  if (isProduction) {
    logger.add(new winston.transports.Console({
      level: resolvedLogLevel,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    }));
  } else {
    logger.add(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }));
  }
}

module.exports = logger;
