const http = require('http');
const { app, logger } = require('./app');
const env = require('./config/env');
const db = require('./config/database');
const redisClient = require('./config/redis');
const wsManager = require('./websocket/manager');

const server = http.createServer(app);

// Function to handle clean shutdown
async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  // Close server
  server.close(() => {
    logger.info('HTTP server closed.');
  });

  try {
    // Close Database pool
    await db.pool.end();
    logger.info('PostgreSQL connection pool closed.');

    // Close Redis client
    await redisClient.quit();
    logger.info('Redis client disconnected.');

    process.exit(0);
  } catch (err) {
    logger.error(err, 'Error during graceful shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

(async () => {
  try {
    // Initialize WebSocket Manager (includes pub/sub connect)
    await wsManager.init(server);

    server.listen(env.PORT, () => {
      logger.info(`🚀 HTTP and WebSocket Server listening on port ${env.PORT} in ${env.NODE_ENV} mode`);
    });
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }
})();
