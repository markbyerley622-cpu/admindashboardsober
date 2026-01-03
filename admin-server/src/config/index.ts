// =============================================================================
// CONFIGURATION - Centralized environment configuration with validation
// =============================================================================
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Schema validation ensures all required config is present at startup
const configSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  port: z.coerce.number().default(4000),
  apiPrefix: z.string().default('/api/v1'),

  // Database
  databaseUrl: z.string().min(1, 'DATABASE_URL is required'),

  // JWT
  jwtSecret: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  jwtExpiresIn: z.string().default('24h'),
  jwtRefreshExpiresIn: z.string().default('7d'),

  // S3
  s3Endpoint: z.string().optional(),
  s3Region: z.string().default('us-east-1'),
  s3AccessKey: z.string().min(1, 'S3_ACCESS_KEY is required'),
  s3SecretKey: z.string().min(1, 'S3_SECRET_KEY is required'),
  s3Bucket: z.string().default('proofs'),
  s3SignedUrlExpires: z.coerce.number().default(3600),

  // CORS
  corsOrigins: z.string().transform((val) => val.split(',')).default('http://localhost:3000'),

  // Rate Limiting
  rateLimitWindowMs: z.coerce.number().default(900000), // 15 minutes
  rateLimitMaxRequests: z.coerce.number().default(100),

  // Webhooks
  webhookSecret: z.string().min(16, 'WEBHOOK_SECRET must be at least 16 characters'),
  userAppWebhookUrl: z.string().optional(),

  // Security
  bcryptRounds: z.coerce.number().default(12),
  skipSignatureCheck: z.coerce.boolean().default(false),

  // File Upload
  maxFileSizeMb: z.coerce.number().default(10),
  allowedMimeTypes: z.string()
    .transform((val) => val.split(','))
    .default('image/jpeg,image/png,image/webp'),
});

const parseConfig = () => {
  const result = configSchema.safeParse({
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    apiPrefix: process.env.API_PREFIX,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN,
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
    s3Endpoint: process.env.S3_ENDPOINT,
    s3Region: process.env.S3_REGION,
    s3AccessKey: process.env.S3_ACCESS_KEY,
    s3SecretKey: process.env.S3_SECRET_KEY,
    s3Bucket: process.env.S3_BUCKET,
    s3SignedUrlExpires: process.env.S3_SIGNED_URL_EXPIRES,
    corsOrigins: process.env.CORS_ORIGINS,
    rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS,
    rateLimitMaxRequests: process.env.RATE_LIMIT_MAX_REQUESTS,
    webhookSecret: process.env.WEBHOOK_SECRET,
    userAppWebhookUrl: process.env.USER_APP_WEBHOOK_URL,
    bcryptRounds: process.env.BCRYPT_ROUNDS,
    skipSignatureCheck: process.env.SKIP_SIGNATURE_CHECK,
    maxFileSizeMb: process.env.MAX_FILE_SIZE_MB,
    allowedMimeTypes: process.env.ALLOWED_MIME_TYPES,
  });

  if (!result.success) {
    console.error('Configuration validation failed:');
    result.error.issues.forEach((issue) => {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    });
    process.exit(1);
  }

  return result.data;
};

export const config = parseConfig();
export type Config = typeof config;
