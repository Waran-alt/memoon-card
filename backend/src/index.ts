import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { createFSRS } from './services/fsrs.service';
import { testConnection } from './config/database';
import { errorHandler, asyncHandler } from './middleware/errorHandler';
import { requestIdMiddleware } from './middleware/requestId';
import { authMiddleware } from './middleware/auth';
import { csrfProtection } from './middleware/csrf';
import { PORT, getAllowedOrigins, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX, AUTH_RATE_LIMIT_WINDOW_MS, AUTH_RATE_LIMIT_MAX, MAX_REQUEST_SIZE, NODE_ENV } from './config/env';
import { HTTP_STATUS, HTTP_HEADERS, SECURITY_HEADERS, AUTH_RATE_LIMIT } from './constants/http.constants';
import authRoutes from './routes/auth.routes';
import decksRoutes from './routes/decks.routes';
import cardsRoutes from './routes/cards.routes';
import reviewsRoutes from './routes/reviews.routes';
import optimizationRoutes from './routes/optimization.routes';
import { logger, serializeError } from './utils/logger';

const app = express();

// Trust first proxy (e.g. nginx) so req.secure and req.ip reflect X-Forwarded-* and X-Real-IP
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'"], // Removed 'unsafe-inline' for better security
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: NODE_ENV === 'production' ? [] : null,
    },
  },
  hsts: {
    maxAge: SECURITY_HEADERS.HSTS_MAX_AGE_SECONDS,
    includeSubDomains: SECURITY_HEADERS.HSTS_INCLUDE_SUBDOMAINS,
    preload: SECURITY_HEADERS.HSTS_PRELOAD,
  },
  // Additional security headers
  xContentTypeOptions: true,
  xFrameOptions: { action: 'deny' },
  xXssProtection: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// Request ID for tracing
app.use(requestIdMiddleware);

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (getAllowedOrigins().includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: HTTP_HEADERS.OPTIONS_SUCCESS_STATUS,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Stricter rate limit for auth (login/register/refresh) to mitigate brute force.
const authLimitMax =
  AUTH_RATE_LIMIT_MAX ??
  (NODE_ENV === 'production' ? AUTH_RATE_LIMIT.MAX : 2000);
const authLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS ?? AUTH_RATE_LIMIT.WINDOW_MS,
  max: authLimitMax,
  message: 'Too many auth attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth', authLimiter);

// Cookie parsing (for refresh_token httpOnly cookie)
app.use(cookieParser());

// Request logging
morgan.token('request-id', (req) => (req as Request).requestId ?? '-');
app.use(morgan(':method :url :status :response-time ms req_id=:request-id'));

// Body parsing with size limits
app.use(express.json({ limit: MAX_REQUEST_SIZE }));
app.use(express.urlencoded({ extended: true, limit: MAX_REQUEST_SIZE }));

// Health check (no auth required)
app.get('/health', asyncHandler(async (req: Request, res: Response) => {
  const dbConnected = await testConnection();
  const isHealthy = dbConnected;
  
  return res.status(isHealthy ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    service: 'memoon-card-backend',
    database: dbConnected ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    ...(NODE_ENV === 'development' && {
      memory: process.memoryUsage(),
    }),
  });
}));

// Test FSRS endpoint (only in development)
if (NODE_ENV !== 'production') {
  app.get('/api/test-fsrs', asyncHandler(async (req: Request, res: Response) => {
    const fsrs = createFSRS();
    
    // Test new card
    const result = fsrs.reviewCard(null, 3); // Good rating
    
    return res.json({
      success: true,
      test: 'new-card',
      result: {
        stability: result.state.stability,
        difficulty: result.state.difficulty,
        nextReview: result.state.nextReview,
        message: result.message,
      },
    });
  }));
}

// Auth routes (no auth/CSRF required for login/register/refresh)
app.use('/api/auth', authRoutes);

// API Routes (require authentication + CSRF protection)
// CSRF protection applies to state-changing methods (POST, PUT, DELETE, PATCH)
app.use('/api', csrfProtection);
app.use('/api/decks', authMiddleware, decksRoutes);
app.use('/api/cards', authMiddleware, cardsRoutes);
app.use('/api/reviews', authMiddleware, reviewsRoutes);
app.use('/api/optimization', authMiddleware, optimizationRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
  return res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

// Global error handler (must be last)
app.use(errorHandler);

// Start server
async function startServer() {
  // Test database connection
  const dbConnected = await testConnection();
  
  if (!dbConnected && NODE_ENV === 'production') {
    logger.error('Database connection failed during startup');
    process.exit(1);
  }
  
  app.listen(PORT, () => {
    logger.info('Server started', { port: PORT, nodeEnv: NODE_ENV });
    logger.info('Health endpoint ready', { url: `http://localhost:${PORT}/health` });
    if (NODE_ENV !== 'production') {
      logger.info('FSRS test endpoint ready', {
        url: `http://localhost:${PORT}/api/test-fsrs`,
      });
    }
  });
}

startServer().catch((error) => {
  logger.error('Failed to start server', { error: serializeError(error) });
  process.exit(1);
});
