const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const pino = require('pino');

// Initialize logger
const logger = pino({
  level: env.NODE_ENV === 'development' ? 'debug' : 'info',
  transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});

const app = express();
app.set('trust proxy', true);

// Security Middlewares
app.use(helmet({
  contentSecurityPolicy: env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", env.DASHBOARD_URL.replace(/^http/, 'ws')],
    }
  } : false,
}));

app.use(cors({
  origin: env.DASHBOARD_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate Limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests, please try again later.',
    }
  }
});
app.use(globalLimiter);

app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  logger.info({ method: req.method, url: req.url, ip: req.ip }, 'Incoming Request');
  next();
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  res.json({
    status: 'ok',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// Register routes
const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const serversRoutes = require('./routes/servers.routes');
const socks5UsersRoutes = require('./routes/socks5-users.routes');
const metricsRoutes = require('./routes/metrics.routes');
const installersRoutes = require('./routes/installers.routes');

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/servers', serversRoutes);
app.use('/api/servers/:serverId/socks5-users', socks5UsersRoutes);
app.use('/api/servers/:serverId/metrics', metricsRoutes);
app.use('/api/installers', installersRoutes);

// Global 404 handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.url}`,
    }
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  logger.error(err, 'Unhandled Application Error');

  const statusCode = err.status || 500;
  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: env.NODE_ENV === 'production' ? 'An unexpected error occurred.' : err.message,
    }
  });
});

module.exports = { app, logger };
