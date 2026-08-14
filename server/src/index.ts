import dotenv from 'dotenv';

// Must run before other imports that read process.env
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import authRoutes from './routes/auth';
import vocabularyRoutes from './routes/vocabulary';
import quizRoutes from './routes/quizzes';
import analyticsRoutes from './routes/analytics';
import testDbRoutes from './routes/testDb';
import { verifyCSRFToken, getCSRFToken } from './middleware/csrf';
import { authMiddleware } from './middleware/auth';
import { sanitizeInput } from './middleware/sanitize';
import { requestIdMiddleware } from './middleware/requestId';
import { requestLoggerMiddleware } from './middleware/requestLogger';
import { getHealthStatus } from './utils/health';
import logger from './utils/logger';

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://languagelearningapp-z0ca.onrender.com',
  'http://localhost:3000',
].filter(Boolean) as string[];

const limiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 500, // limit each IP to 500 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
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
// Request ID must be early so later middleware and logs can use it
app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);
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
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

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

app.use(sanitizeInput);

app.get('/api/health', async (req, res) => {
  const health = await getHealthStatus();
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

async function startServer() {
  try {
    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/api/health`);
      logger.info(`Security: XSS & CSRF protection enabled`);
    });

    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use. Please kill the process using it and try again.`);
      } else {
        logger.error('Server error:', error);
      }
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  logger.info('Shutting down server...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down server...');
  process.exit(0);
});

startServer();