import dotenv from 'dotenv';

// Load environment variables first
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
// Import routes
import authRoutes from './routes/auth';
import vocabularyRoutes from './routes/vocabulary';
import quizRoutes from './routes/quizzes';
import analyticsRoutes from './routes/analytics';
import testDbRoutes from './routes/testDb';
// Import security middleware
import { verifyCSRFToken, getCSRFToken } from './middleware/csrf';
import { authMiddleware } from './middleware/auth';
import { sanitizeInput } from './middleware/sanitize';
import { requestIdMiddleware } from './middleware/requestId';
import { requestLoggerMiddleware } from './middleware/requestLogger';
import { connectToDatabase } from './utils/mongo';
import { redisHealthCheck } from './utils/redis';
import { connectToTestDatabase } from './utils/testMongo';
import { AIService } from './services/ai';
import logger from './utils/logger';

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://languagelearningapp-z0ca.onrender.com',
  'http://localhost:3000',
].filter(Boolean) as string[];

// Rate limiting
const limiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 500, // limit each IP to 500 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

// Security Middleware
// Enhanced helmet configuration with Content Security Policy
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // React requires inline scripts
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true
}));

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (allowedOrigins.includes(origin)) {
      callback(null, origin);
      return;
    }
    logger.warn(`CORS not allowed for origin: ${origin}`);
    callback(null, false);
  },
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
}));
// Request ID tracking - must be early in the middleware stack
app.use(requestIdMiddleware);
// Request/response logging with request ID
app.use(requestLoggerMiddleware);
// Compression with filter
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6 // Balance between speed and compression ratio
}));
app.use(limiter);
// Request size limits (prevent DoS)
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Sanitize data to prevent NoSQL injection
app.use(mongoSanitize({
  replaceWith: '_',  // Replace prohibited characters with underscore
  onSanitize: ({ req, key }) => {
    logger.warn(`Sanitized key "${key}" from request`, {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
  }
}));

// Input sanitization middleware (XSS protection)
app.use(sanitizeInput);

// Health check endpoint
// Detailed health check endpoint
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    checks: {
      database: 'unknown',
      ai: 'unknown',
      redis: 'unknown'
    }
  };

  // Check database
  try {
    // Use test database in test environment, main database otherwise
    const db = process.env.NODE_ENV === 'test' ? await connectToTestDatabase() : await connectToDatabase();
    await db.admin().ping();
    health.checks.database = 'healthy';
  } catch (error) {
    logger.error('Health check - Database failed:', error);
    health.checks.database = 'unhealthy';
    health.status = 'DEGRADED';
  }

  // Check AI service (non-critical for tests)
  try {
    await AIService.healthCheck();
    health.checks.ai = 'healthy';
  } catch (error) {
    logger.error('Health check - AI failed:', error);
    health.checks.ai = 'unhealthy';
    // Only mark as degraded if not in test environment
    if (process.env.NODE_ENV !== 'test') {
      health.status = 'DEGRADED';
    }
  }

  // Check Redis (CSRF token store)
  try {
    const ok = await redisHealthCheck();
    health.checks.redis = ok ? 'healthy' : 'unhealthy';
    if (!ok) health.status = 'DEGRADED';
  } catch (error) {
    logger.error('Health check - Redis failed:', error);
    health.checks.redis = 'unhealthy';
    health.status = 'DEGRADED';
  }

  const statusCode = health.status === 'OK' ? 200 : 503;
  res.status(statusCode).json(health);
});

app.get('/api/csrf-token', authMiddleware, getCSRFToken);
app.use('/api/auth', authRoutes);
app.use('/api/vocabulary', authMiddleware, verifyCSRFToken, vocabularyRoutes);
app.use('/api/quizzes', authMiddleware, verifyCSRFToken, quizRoutes);
app.use('/api/analytics', authMiddleware, verifyCSRFToken, analyticsRoutes);
// Test database routes (only available in non-production environments)
app.use('/api/test-db', testDbRoutes);

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

import { errorHandler } from './middleware/error';
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(`🔒 Security: XSS & CSRF protection enabled`);
    });

    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`❌ Port ${PORT} is already in use. Please kill the process using it and try again.`);
      } else {
        logger.error('❌ Server error:', error);
      }
      process.exit(1);
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('\n🛑 Shutting down server...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('\n🛑 Shutting down server...');
  process.exit(0);
});

startServer();