require('dotenv').config();

const app = require('./app');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 4100;

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Admin backend started on port ${PORT}`, {
    env: process.env.NODE_ENV || 'development'
  });
});

const shutdown = (signal) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

