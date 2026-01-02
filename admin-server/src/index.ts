// =============================================================================
// ADMIN VERIFICATION SERVER - Entry Point
// =============================================================================
// Production-ready admin server for task verification and moderation
// Handles:
//  - Admin authentication and RBAC
//  - Submission queue management
//  - Proof file handling via S3
//  - Webhook integration with user app
// =============================================================================
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config/index.js';
import { connectDatabase, healthCheck } from './services/database.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { successResponse, errorResponse } from './utils/index.js';

// Routes
import authRoutes from './routes/auth.js';
import submissionRoutes from './routes/submissions.js';
import uploadRoutes from './routes/upload.js';
import integrationRoutes from './routes/user-app-integration.js';
import publicRoutes from './routes/public.js';
import { readFile, getFileMetadata } from './services/storage.js';

// =============================================================================
// APP INITIALIZATION
// =============================================================================
const app = express();

// Trust proxy - required for Render/Heroku/etc where app is behind a load balancer
// This allows express-rate-limit to correctly identify users via X-Forwarded-For
app.set('trust proxy', 1);

// =============================================================================
// SECURITY MIDDLEWARE
// =============================================================================

// Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:", "*"], // Allow images from S3
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// CORS configuration
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Signature', 'X-Webhook-Signature'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  message: errorResponse('TOO_MANY_REQUESTS', 'Too many requests, please try again later'),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Stricter rate limit for auth endpoints (relaxed for development)
const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 100, // 100 attempts per minute in dev
  message: errorResponse('TOO_MANY_REQUESTS', 'Too many login attempts'),
  skip: () => config.nodeEnv === 'development', // Skip rate limiting in development
});

// =============================================================================
// BODY PARSING (preserve raw body for signature verification)
// =============================================================================
app.use(express.json({
  limit: '1mb',
  verify: (req: any, _res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// =============================================================================
// HEALTH CHECK
// =============================================================================
app.get('/health', async (_req, res) => {
  const dbHealthy = await healthCheck();

  if (dbHealthy) {
    res.json(successResponse({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
    }));
  } else {
    res.status(503).json(errorResponse(
      'UNHEALTHY',
      'Service unhealthy',
      { database: 'disconnected' }
    ));
  }
});

// =============================================================================
// DEBUG ENDPOINT - Test signature verification
// =============================================================================
import { createHmacSignature } from './utils/index.js';

app.post('/debug/test-signature', (req: any, res) => {
  const signature = req.headers['x-signature'] as string;
  const rawBody = req.rawBody;
  const bodyStr = JSON.stringify(req.body);

  const expectedFromRaw = rawBody ? createHmacSignature(rawBody, config.webhookSecret) : 'NO_RAW_BODY';
  const expectedFromStringify = createHmacSignature(bodyStr, config.webhookSecret);

  res.json({
    success: true,
    debug: {
      receivedSignature: signature || 'NOT_PROVIDED',
      hasRawBody: !!rawBody,
      rawBodyLength: rawBody?.length || 0,
      stringifiedBodyLength: bodyStr.length,
      expectedSignatureFromRawBody: expectedFromRaw,
      expectedSignatureFromStringify: expectedFromStringify,
      signaturesMatch: signature === expectedFromRaw || signature === expectedFromStringify,
      secretFirstChars: config.webhookSecret.substring(0, 10) + '...',
    }
  });
});

// =============================================================================
// API ROUTES
// =============================================================================
const apiPrefix = config.apiPrefix;

// Auth routes (with stricter rate limiting)
app.use(`${apiPrefix}/auth`, authLimiter, authRoutes);

// Submission management routes
app.use(`${apiPrefix}/submissions`, submissionRoutes);

// Upload routes (called by user app)
app.use(`${apiPrefix}/upload`, uploadRoutes);

// Integration routes (for user app backend)
app.use(`${apiPrefix}/integration`, integrationRoutes);

// Public routes (no auth required - for user app frontend)
app.use(`${apiPrefix}/public`, publicRoutes);

// File serving route (for local development)
app.get(`${apiPrefix}/files/:key`, async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);
    const meta = await getFileMetadata(key);

    if (!meta) {
      res.status(404).json(errorResponse('NOT_FOUND', 'File not found'));
      return;
    }

    const file = await readFile(key);
    if (!file) {
      res.status(404).json(errorResponse('NOT_FOUND', 'File not found'));
      return;
    }

    res.setHeader('Content-Type', meta.contentType);
    res.setHeader('Content-Length', meta.size);
    res.send(file);
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to serve file'));
  }
});

// =============================================================================
// ERROR HANDLING
// =============================================================================
app.use(notFoundHandler);
app.use(errorHandler);

// =============================================================================
// SERVER STARTUP
// =============================================================================
async function startServer(): Promise<void> {
  try {
    // Connect to database
    await connectDatabase();

    // Start server
    app.listen(config.port, () => {
      console.log('='.repeat(60));
      console.log('ADMIN VERIFICATION SERVER');
      console.log('='.repeat(60));
      console.log(`Environment: ${config.nodeEnv}`);
      console.log(`Port: ${config.port}`);
      console.log(`API Prefix: ${config.apiPrefix}`);
      console.log('='.repeat(60));
      console.log('Endpoints:');
      console.log(`  Health:      GET  /health`);
      console.log(`  Auth:        POST ${apiPrefix}/auth/login`);
      console.log(`  Submissions: GET  ${apiPrefix}/submissions`);
      console.log(`  Upload:      POST ${apiPrefix}/upload/request`);
      console.log(`  Integration: POST ${apiPrefix}/integration/*`);
      console.log(`  Public:      GET  ${apiPrefix}/public/stats`);
      console.log('='.repeat(60));
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...');
  process.exit(0);
});

// Start the server
startServer();

export default app;
