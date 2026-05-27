const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

dotenv.config({ override: true });

const isProduction = process.env.NODE_ENV === 'production';
const gracefulShutdownMs = Number(process.env.GRACEFUL_SHUTDOWN_MS) || 10000;

// Validate required environment variables. Development keeps the lightweight
// defaults, but production should never silently boot without persistence or
// the allowlisted frontend origin.
const REQUIRED_ENV_VARS = ['GEMINI_API_KEY', 'SOSO_API_KEY'];
const PRODUCTION_REQUIRED_ENV_VARS = ['MONGO_URI', 'CORS_ORIGIN', 'ETHERSCAN_API_KEY'];
const requiredVars = isProduction
  ? [...REQUIRED_ENV_VARS, ...PRODUCTION_REQUIRED_ENV_VARS]
  : REQUIRED_ENV_VARS;
const missingVars = requiredVars.filter((v) => !process.env[v]);
if (missingVars.length > 0) {
  console.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;
const allowedOrigins = (process.env.CORS_ORIGIN || process.env.FRONTEND_URL || (isProduction ? '' : 'http://localhost:3000'))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (isProduction && allowedOrigins.length === 0) {
  console.error('CORS_ORIGIN must be configured in production.');
  process.exit(1);
}

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    const corsError = new Error('Not allowed by CORS');
    corsError.status = 403;
    callback(corsError);
  }
}));
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.on('finish', () => {
    console.log(JSON.stringify({
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt
    }));
  });

  next();
});

const createRateLimitHandler = (message) => (req, res) => {
  res.status(429).json({
    error: true,
    message,
    requestId: req.id
  });
};

const agentLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.AGENT_RATE_LIMIT_PER_MINUTE) || 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: createRateLimitHandler('Analysis request rate limit reached. Please wait a moment and try again.')
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.CHAT_RATE_LIMIT_PER_MINUTE) || 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: createRateLimitHandler('Chat request rate limit reached. Please wait a moment and try again.')
});

const marketLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.MARKET_RATE_LIMIT_PER_MINUTE) || 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: createRateLimitHandler('Market dashboard rate limit reached. Please wait a moment while cached data is used.')
});

const getMongoHealth = () => ({
  configured: Boolean(process.env.MONGO_URI),
  connected: mongoose.connection.readyState === 1,
  readyState: mongoose.connection.readyState
});

// Connect to MongoDB
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 10000,
    maxPoolSize: 10,
    minPoolSize: 2,
    socketTimeoutMS: 45000
  })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));
} else {
  console.warn('MONGO_URI not found. Database-backed features are disabled.');
}

// Routes
const sosoRoutes = require('./routes/sosovalue');
const agentRoutes = require('./routes/agent');
const chatRoutes = require('./routes/chats');
const sodexRoutes = require('./routes/sodex');
const marketRoutes = require('./routes/market');

app.use('/api/soso', agentLimiter, sosoRoutes);
app.use('/api/agent', agentLimiter, agentRoutes);
app.use('/api/chats', chatLimiter, chatRoutes);
app.use('/api/sodex', agentLimiter, sodexRoutes);
app.use('/api/market', marketLimiter, marketRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'SoSo Analyst API is running. Use /api/* for endpoints.' });
});

app.get('/health', (req, res) => {
  const mongo = getMongoHealth();
  const ready = !mongo.configured || mongo.connected;
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'degraded',
    uptimeSeconds: Math.round(process.uptime()),
    mongo
  });
});

app.get('/ready', (req, res) => {
  const mongo = getMongoHealth();
  const ready = !mongo.configured || mongo.connected;
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    mongo
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  console.error(JSON.stringify({
    requestId: req.id,
    message: err.message,
    stack: isProduction ? undefined : err.stack,
    path: req.path,
    method: req.method
  }));

  res.status(statusCode).json({
    error: true,
    message: statusCode === 500 ? 'Internal Server Error' : err.message,
    requestId: req.id
  });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const shutdown = (signal) => {
  console.log(`Received ${signal}. Shutting down gracefully.`);
  server.close(async () => {
    try {
      await mongoose.connection.close(false);
      console.log('MongoDB connection closed.');
    } catch (error) {
      console.error('Error closing MongoDB connection:', error);
    } finally {
      process.exit(0);
    }
  });

  setTimeout(() => {
    console.error('Graceful shutdown timed out. Exiting.');
    process.exit(1);
  }, gracefulShutdownMs).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown('uncaughtException');
});
