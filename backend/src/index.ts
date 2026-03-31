/**
 * MemoOn-Card API entrypoint.
 *
 * Middleware order (do not reorder lightly):
 * security headers → request id → CORS → **global** `/api/` rate limit → cookies → body parser →
 * public routes (`/health`, `/api/auth`, `/api/version`) → **then** `csrfProtection` on `/api` →
 * authenticated routers. Auth and version are registered **before** CSRF so login/refresh/session stay exempt.
 *
 * Business logic: `services/`. Request validation: `schemas/` (Zod). DB pool: `config/database.ts`.
 *
 * Helmet (CSP, HSTS in prod) + CORS allowlist: grid 2.3 / 4.6; trust proxy = 1 hop (2.4).
 */
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
import { authMiddleware, requireAdmin, requireDev } from './middleware/auth';
import { csrfProtection } from './middleware/csrf';
import { PORT, getAllowedOrigins, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX, MAX_REQUEST_SIZE, NODE_ENV, POSTGRES_DB } from './config/env';
import { HTTP_STATUS, HTTP_HEADERS, SECURITY_HEADERS } from './constants/http.constants';
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import userRoutes from './routes/user.routes';
import decksRoutes from './routes/decks.routes';
import knowledgeRoutes from './routes/knowledge.routes';
import cardsRoutes from './routes/cards.routes';
import reviewsRoutes from './routes/reviews.routes';
import optimizationRoutes from './routes/optimization.routes';
import fsrsMetricsRoutes from './routes/fsrs-metrics.routes';
import studyRoutes from './routes/study.routes';
import adminRoutes from './routes/admin.routes';
import devRoutes from './routes/dev.routes';
import { FsrsMetricsJobService } from './services/fsrs-metrics-job.service';
import { ensureDevUser } from './dev/ensureDevUser';
import { logger, serializeError } from './utils/logger';

const app = express();
const fsrsMetricsJob = new FsrsMetricsJobService();

// One hop: matches a single reverse proxy. If you chain several proxies, increase carefully (IP spoofing risk).
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

// CORS: `origin` is absent for same-origin browser requests and many non-browser clients; those are allowed here.
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

// Counts **all** `/api/*` traffic per IP, including `/api/auth/*` (login spam protection shares this bucket).
app.use('/api/', limiter);

// Cookie parsing (for refresh_token httpOnly cookie)
app.use(cookieParser());

// Request logging
morgan.token('request-id', (req) => (req as Request).requestId ?? '-');
app.use(morgan(':method :url :status :response-time ms req_id=:request-id'));

// Body parsing with size limits
app.use(express.json({ limit: MAX_REQUEST_SIZE }));
app.use(express.urlencoded({ extended: true, limit: MAX_REQUEST_SIZE }));

// Health check (no auth required). Production returns minimal JSON to reduce information disclosure.
app.get('/health', asyncHandler(async (_req: Request, res: Response) => {
  const dbConnected = await testConnection();
  const isHealthy = dbConnected;

  if (NODE_ENV === 'production') {
    return res.status(isHealthy ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
    });
  }

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

// Version (public, no auth) — used by VersionFooter; Nginx proxies /api to backend so Next.js route never receives it in prod
app.get('/api/version', (_req: Request, res: Response) => {
  const version = process.env.GIT_SHA ?? process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev';
  return res.json({ version });
});

// API Routes (require authentication + CSRF protection)
// CSRF protection applies to state-changing methods (POST, PUT, DELETE, PATCH)
app.use('/api', csrfProtection);
app.use('/api/users', authMiddleware, usersRoutes);
app.use('/api/user', authMiddleware, userRoutes);
app.use('/api/decks', authMiddleware, decksRoutes);
app.use('/api/knowledge', authMiddleware, knowledgeRoutes);
app.use('/api/cards', authMiddleware, cardsRoutes);
app.use('/api/reviews', authMiddleware, reviewsRoutes);
app.use('/api/study', authMiddleware, studyRoutes);
app.use('/api/optimization', authMiddleware, optimizationRoutes);
app.use('/api/optimization/metrics', authMiddleware, fsrsMetricsRoutes);
app.use('/api/admin', authMiddleware, requireAdmin, adminRoutes);
app.use('/api/dev', authMiddleware, requireDev, devRoutes);

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
  logger.info('Backend starting', { postgresDb: POSTGRES_DB });
  // Test database connection
  const dbConnected = await testConnection();
  
  if (!dbConnected && NODE_ENV === 'production') {
    logger.error('Database connection failed during startup');
    process.exit(1);
  }

  await ensureDevUser();

  fsrsMetricsJob.start();
  
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

process.on('SIGTERM', () => {
  fsrsMetricsJob.stop();
});

process.on('SIGINT', () => {
  fsrsMetricsJob.stop();
});
