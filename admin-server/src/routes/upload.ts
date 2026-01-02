// =============================================================================
// UPLOAD ROUTES - Secure file upload handling
// =============================================================================
// This endpoint is called by the USER APP, not the admin dashboard.
// It provides signed URLs for direct uploads to S3.
// =============================================================================
import { Router, raw } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { prisma } from '../services/database.js';
import { generateProofKey, getSignedUploadUrl, uploadFile } from '../services/storage.js';
import { config } from '../config/index.js';
import { successResponse, errorResponse } from '../utils/index.js';
import { Errors } from '../middleware/errorHandler.js';
import { verifyHmacSignature, createSubmissionHash } from '../utils/index.js';

const router = Router();

// Rate limiter for submissions - prevent abuse
// 5 submissions per wallet per 10 minutes
const submissionRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // 5 submissions per window
  message: errorResponse('TOO_MANY_REQUESTS', 'Too many submissions. Please wait 10 minutes before trying again.'),
  keyGenerator: (req) => {
    // Rate limit by wallet address
    return req.body?.walletAddress || req.ip || 'unknown';
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Validation schemas
const requestUploadSchema = z.object({
  walletAddress: z.string().min(32).max(64),
  taskId: z.string().min(1).max(100), // Task IDs are strings like "daily-check-in"
  filename: z.string().max(255),
  contentType: z.string(),
  fileSize: z.number().positive(),
});

const confirmUploadSchema = z.object({
  walletAddress: z.string().min(32).max(64),
  taskId: z.string().min(1).max(100), // Task IDs are strings like "daily-check-in"
  uploadKey: z.string(),
  userNote: z.string().max(500).optional(),
});

/**
 * Verify request signature from user app
 * Prevents unauthorized upload requests
 */
function verifyUserAppSignature(
  payload: string,
  signature: string | undefined
): boolean {
  if (!signature) return false;
  return verifyHmacSignature(payload, signature, config.webhookSecret);
}

/**
 * POST /upload/request
 * Request a signed URL for uploading proof
 * Called by user app with a signed request
 */
router.post('/request', submissionRateLimiter, async (req, res, next) => {
  try {
    // Verify signature from user app (use raw body to preserve exact payload)
    const signature = req.headers['x-signature'] as string;
    const bodyStr = (req as any).rawBody || JSON.stringify(req.body);

    if (!verifyUserAppSignature(bodyStr, signature)) {
      throw Errors.unauthorized('Invalid request signature');
    }

    const data = requestUploadSchema.parse(req.body);

    // Validate content type
    if (!config.allowedMimeTypes.includes(data.contentType)) {
      throw Errors.badRequest(
        `Invalid file type. Allowed: ${config.allowedMimeTypes.join(', ')}`
      );
    }

    // Validate file size
    const maxBytes = config.maxFileSizeMb * 1024 * 1024;
    if (data.fileSize > maxBytes) {
      throw Errors.badRequest(`File too large. Maximum: ${config.maxFileSizeMb}MB`);
    }

    // Verify task exists
    const task = await prisma.task.findUnique({
      where: { id: data.taskId },
    });

    if (!task || !task.isActive) {
      throw Errors.notFound('Task');
    }

    // Find or create platform user
    let user = await prisma.platformUser.findUnique({
      where: { walletAddress: data.walletAddress },
    });

    if (!user) {
      user = await prisma.platformUser.create({
        data: { walletAddress: data.walletAddress },
      });
    }

    // Check if user is suspended
    if (user.isSuspended) {
      throw Errors.forbidden('Account is suspended');
    }

    // Check for duplicate pending submissions
    const existingPending = await prisma.taskSubmission.findFirst({
      where: {
        userId: user.id,
        taskId: data.taskId,
        status: { in: ['PENDING', 'UNDER_REVIEW'] },
      },
    });

    if (existingPending) {
      throw Errors.conflict('You already have a pending submission for this task');
    }

    // Generate upload key and signed URL
    const uploadKey = generateProofKey(data.walletAddress, data.filename);
    const signedUrl = await getSignedUploadUrl(uploadKey, data.contentType);

    // Create temporary upload token (expires in 10 minutes)
    const uploadToken = crypto.randomBytes(32).toString('hex');
    const uploadTokenExpiry = new Date(Date.now() + 10 * 60 * 1000);

    // Store pending upload info (you'd typically use Redis for this in production)
    // For simplicity, we'll encode it in the response

    res.json(successResponse({
      uploadUrl: signedUrl,
      uploadKey,
      uploadToken,
      expiresAt: uploadTokenExpiry.toISOString(),
    }));
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /upload/direct
 * Direct file upload endpoint for local development
 * Receives the raw file body and stores it locally
 */
router.put('/direct', raw({ type: '*/*', limit: '10mb' }), async (req, res, next) => {
  try {
    const key = req.query.key as string;
    if (!key) {
      throw Errors.badRequest('Missing upload key');
    }

    const contentType = req.headers['content-type'] || 'application/octet-stream';
    const body = req.body as Buffer;

    if (!body || body.length === 0) {
      throw Errors.badRequest('Empty file body');
    }

    await uploadFile(key, body, contentType);

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /upload/confirm
 * Confirm upload completion and create submission
 * Called by user app after successful S3 upload
 */
router.post('/confirm', submissionRateLimiter, async (req, res, next) => {
  try {
    // Verify signature from user app (use raw body to preserve exact payload)
    const signature = req.headers['x-signature'] as string;
    const bodyStr = (req as any).rawBody || JSON.stringify(req.body);

    if (!verifyUserAppSignature(bodyStr, signature)) {
      throw Errors.unauthorized('Invalid request signature');
    }

    const data = confirmUploadSchema.parse(req.body);

    // Find user
    const user = await prisma.platformUser.findUnique({
      where: { walletAddress: data.walletAddress },
    });

    if (!user) {
      throw Errors.notFound('User');
    }

    if (user.isSuspended) {
      throw Errors.forbidden('Account is suspended');
    }

    // Verify task exists
    const task = await prisma.task.findUnique({
      where: { id: data.taskId },
    });

    if (!task || !task.isActive) {
      throw Errors.notFound('Task');
    }

    // Create unique submission hash to prevent duplicates
    const submissionHash = createSubmissionHash(
      data.walletAddress,
      data.taskId,
      new Date()
    );

    // Get file type from key
    const extension = data.uploadKey.split('.').pop() || '';
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      mp4: 'video/mp4',
      webm: 'video/webm',
    };

    // Create submission
    const submission = await prisma.$transaction(async (tx) => {
      const sub = await tx.taskSubmission.create({
        data: {
          userId: user.id,
          taskId: data.taskId,
          status: 'PENDING',
          proofFileKey: data.uploadKey,
          proofFileType: mimeTypes[extension] || 'application/octet-stream',
          proofUploadedAt: new Date(),
          userNote: data.userNote,
          submissionHash,
        },
      });

      // Update user pending count
      await tx.platformUser.update({
        where: { id: user.id },
        data: { totalPending: { increment: 1 } },
      });

      return sub;
    });

    res.status(201).json(successResponse({
      submissionId: submission.id,
      status: submission.status,
      submittedAt: submission.submittedAt,
    }));
  } catch (error) {
    next(error);
  }
});

export default router;
