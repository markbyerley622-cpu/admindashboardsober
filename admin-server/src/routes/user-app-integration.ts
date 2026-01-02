// =============================================================================
// USER APP INTEGRATION - API routes for the user-facing app
// =============================================================================
// These endpoints are called by the USER APP to:
// - Check submission status
// - Get user's submission history
// - Claim approved rewards
//
// All endpoints require signed requests from the user app
// =============================================================================
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../services/database.js';
import { config } from '../config/index.js';
import { successResponse } from '../utils/index.js';
import { Errors } from '../middleware/errorHandler.js';
import { verifyHmacSignature } from '../utils/index.js';

const router = Router();

/**
 * Verify request signature from user app
 */
function verifyAppSignature(
  req: { body: unknown; headers: { 'x-signature'?: string }; rawBody?: string }
): boolean {
  const signature = req.headers['x-signature'];
  if (!signature) return false;

  // Use raw body to preserve exact payload for signature verification
  const payload = req.rawBody || JSON.stringify(req.body);
  return verifyHmacSignature(payload, signature, config.webhookSecret);
}

/**
 * Middleware to verify all requests
 */
function requireAppSignature(
  req: { body: unknown; headers: Record<string, string | undefined> },
  res: { status: (code: number) => { json: (data: unknown) => void } },
  next: () => void
): void {
  if (!verifyAppSignature(req as { body: unknown; headers: { 'x-signature'?: string } })) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid signature' } });
    return;
  }
  next();
}

// Apply signature verification to all routes
router.use(requireAppSignature as unknown as import('express').RequestHandler);

// =============================================================================
// SUBMISSION STATUS
// =============================================================================

const getStatusSchema = z.object({
  walletAddress: z.string().min(32),
  submissionId: z.string().uuid(),
});

/**
 * POST /integration/submission/status
 * Get current status of a submission
 */
router.post('/submission/status', async (req, res, next) => {
  try {
    const { walletAddress, submissionId } = getStatusSchema.parse(req.body);

    const submission = await prisma.taskSubmission.findFirst({
      where: {
        id: submissionId,
        user: { walletAddress },
      },
      include: {
        task: {
          select: { name: true, rewardAmount: true, rewardToken: true },
        },
      },
    });

    if (!submission) {
      throw Errors.notFound('Submission');
    }

    res.json(successResponse({
      id: submission.id,
      status: submission.status,
      taskName: submission.task.name,
      rewardAmount: submission.task.rewardAmount.toString(),
      rewardToken: submission.task.rewardToken,
      submittedAt: submission.submittedAt,
      reviewedAt: submission.reviewedAt,
      rejectionReason: submission.rejectionReason,
      rewardTxHash: submission.rewardTxHash,
    }));
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// USER SUBMISSIONS HISTORY
// =============================================================================

const getHistorySchema = z.object({
  walletAddress: z.string().min(32),
  page: z.number().optional().default(1),
  limit: z.number().optional().default(20),
});

/**
 * POST /integration/submissions/history
 * Get user's submission history
 */
router.post('/submissions/history', async (req, res, next) => {
  try {
    const { walletAddress, page, limit } = getHistorySchema.parse(req.body);

    const user = await prisma.platformUser.findUnique({
      where: { walletAddress },
    });

    if (!user) {
      res.json(successResponse({ items: [], total: 0 }));
      return;
    }

    const [submissions, total] = await Promise.all([
      prisma.taskSubmission.findMany({
        where: { userId: user.id },
        orderBy: { submittedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          task: {
            select: { name: true, category: true, rewardAmount: true, rewardToken: true },
          },
        },
      }),
      prisma.taskSubmission.count({ where: { userId: user.id } }),
    ]);

    res.json(successResponse({
      items: submissions.map((sub) => ({
        id: sub.id,
        taskName: sub.task.name,
        taskCategory: sub.task.category,
        status: sub.status,
        rewardAmount: sub.task.rewardAmount.toString(),
        rewardToken: sub.task.rewardToken,
        submittedAt: sub.submittedAt,
        reviewedAt: sub.reviewedAt,
        rejectionReason: sub.rejectionReason,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    }));
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// REWARD CLAIMING
// =============================================================================

const claimRewardSchema = z.object({
  walletAddress: z.string().min(32),
  submissionId: z.string().uuid(),
});

/**
 * POST /integration/reward/claim
 * Mark reward as claimed and return submission for payment processing
 * This is called by the user app when user wants to claim their reward
 */
router.post('/reward/claim', async (req, res, next) => {
  try {
    const { walletAddress, submissionId } = claimRewardSchema.parse(req.body);

    const submission = await prisma.taskSubmission.findFirst({
      where: {
        id: submissionId,
        user: { walletAddress },
      },
      include: {
        task: true,
        user: true,
      },
    });

    if (!submission) {
      throw Errors.notFound('Submission');
    }

    // Only approved submissions can be claimed
    if (submission.status !== 'APPROVED') {
      throw Errors.badRequest(`Cannot claim reward for submission with status: ${submission.status}`);
    }

    // Update status to reward pending
    await prisma.taskSubmission.update({
      where: { id: submissionId },
      data: { status: 'REWARD_PENDING' },
    });

    // Return data needed for reward payment
    res.json(successResponse({
      submissionId: submission.id,
      walletAddress: submission.user.walletAddress,
      rewardAmount: submission.task.rewardAmount.toString(),
      rewardToken: submission.task.rewardToken,
      taskId: submission.taskId,
      taskName: submission.task.name,
    }));
  } catch (error) {
    next(error);
  }
});

/**
 * POST /integration/reward/confirm
 * Confirm reward payment with transaction hash
 * Called after blockchain transaction is confirmed
 */
const confirmRewardSchema = z.object({
  submissionId: z.string().uuid(),
  txHash: z.string().min(64),
});

router.post('/reward/confirm', async (req, res, next) => {
  try {
    const { submissionId, txHash } = confirmRewardSchema.parse(req.body);

    const submission = await prisma.taskSubmission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      throw Errors.notFound('Submission');
    }

    if (submission.status !== 'REWARD_PENDING') {
      throw Errors.badRequest('Submission is not pending reward');
    }

    await prisma.taskSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'REWARD_PAID',
        rewardTxHash: txHash,
        rewardPaidAt: new Date(),
      },
    });

    res.json(successResponse({ message: 'Reward confirmed' }));
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// USER STATS
// =============================================================================

const getUserStatsSchema = z.object({
  walletAddress: z.string().min(32),
});

/**
 * POST /integration/user/stats
 * Get user's verification stats
 */
router.post('/user/stats', async (req, res, next) => {
  try {
    const { walletAddress } = getUserStatsSchema.parse(req.body);

    const user = await prisma.platformUser.findUnique({
      where: { walletAddress },
    });

    if (!user) {
      res.json(successResponse({
        totalApproved: 0,
        totalRejected: 0,
        totalPending: 0,
        isSuspended: false,
      }));
      return;
    }

    res.json(successResponse({
      totalApproved: user.totalApproved,
      totalRejected: user.totalRejected,
      totalPending: user.totalPending,
      isSuspended: user.isSuspended,
      suspendReason: user.suspendReason,
    }));
  } catch (error) {
    next(error);
  }
});

export default router;
