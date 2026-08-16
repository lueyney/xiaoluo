const logger = require('../utils/logger');

module.exports = function errorHandler (err, req, res, next) {
  logger.error('Unhandled error', {
    requestId: req.requestId,
    path: req.originalUrl,
    method: req.method,
    message: err.message,
    stack: err.stack
  });

  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || err.statusCode || 500;
  const payload = {
    error: err.expose ? err.message : 'Internal Server Error',
    code: err.code || 'INTERNAL_ERROR',
    requestId: req.requestId
  };

  if (process.env.NODE_ENV !== 'production' && err.details) {
    payload.details = err.details;
  }

  res.status(status).json(payload);
};

