import dotenv from 'dotenv';

// Load environment variables first
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import path from "path";
// Import routes
import authRoutes from './routes/auth';
import vocabularyRoutes from './routes/vocabulary';
import quizRoutes from './routes/quizzes';
import analyticsRoutes from './routes/analytics';
// Import security middleware
import { setCSRFToken, verifyCSRFToken, getCSRFToken } from './middleware/csrf';
import { sanitizeInput } from './middleware/sanitize';
import { connectToDatabase } from './utils/mongo';
import { AIService } from './services/ai';

const app = express();
app.set('trust proxy', 1); // Trust first proxy (fixes express-rate-limit error)
const PORT = process.env.PORT || 5000;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
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
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

const allowedOrigins = [
  'https://languagelearningapp-z0ca.onrender.com',
  'http://localhost:3000'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(cookieParser());
app.use(compression());
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Sanitize data to prevent NoSQL injection
app.use(mongoSanitize({
  replaceWith: '_',  // Replace prohibited characters with underscore
  onSanitize: ({ req, key }) => {
    console.warn(`Sanitized key "${key}" from request`, {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
  }
}));

// Input sanitization middleware (XSS protection)
app.use(sanitizeInput);

// CSRF token setup (set token for all requests)
app.use(setCSRFToken);

// Health check endpoint
// Detailed health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    checks: {
      database: 'unknown',
      ai: 'unknown'
    }
  };

  // Check database
  try {
    const db = await connectToDatabase();
    await db.admin().ping();
    health.checks.database = 'healthy';
  } catch (error) {
    console.error('Health check - Database failed:', error);
    health.checks.database = 'unhealthy';
    health.status = 'DEGRADED';
  }

  // Check AI service
  try {
    await AIService.healthCheck();
    health.checks.ai = 'healthy';
  } catch (error) {
    console.error('Health check - AI failed:', error);
    health.checks.ai = 'unhealthy';
    health.status = 'DEGRADED';
  }

  const statusCode = health.status === 'OK' ? 200 : 503;
  res.status(statusCode).json(health);
});

// CSRF token endpoint
app.get('/api/csrf-token', getCSRFToken);

// API routes with CSRF protection
app.use('/api/auth', authRoutes);
app.use('/api/vocabulary', verifyCSRFToken, vocabularyRoutes);
app.use('/api/quizzes', verifyCSRFToken, quizRoutes);
app.use('/api/analytics', verifyCSRFToken, analyticsRoutes);

// Error handling middleware
import { errorHandler } from './middleware/error';
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use(express.static(path.join(__dirname, 'client/build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

// Start server
async function startServer() {
  try {
    // Test database connection
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🔒 Security: XSS & CSRF protection enabled`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down server...');
  process.exit(0);
});

startServer();
