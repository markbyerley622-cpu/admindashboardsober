// =============================================================================
// MODERATION SERVICE - Core business logic for task verification
// =============================================================================
import type { SubmissionStatus, ActionType } from '../types/index.js';
import { prisma } from './database.js';
import { getSignedViewUrl } from './storage.js';
import { emitWebhook } from './webhook.js';
import { shortenWallet } from '../utils/index.js';
import { Errors } from '../middleware/errorHandler.js';
import type {
  SubmissionListItem,
  SubmissionDetail,
  SubmissionFilters,
  PaginationParams,
  DashboardStats,
} from '../types/index.js';

// =============================================================================
// SUBMISSION QUERIES
// =============================================================================

/**
 * Get paginated list of submissions with filters
 */
export async function getSubmissions(
  filters: SubmissionFilters,
  pagination: PaginationParams
): Promise<{ items: SubmissionListItem[]; total: number }> {
  const where: Record<string, unknown> = {};

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.taskCategory) {
    where.task = { category: filters.taskCategory };
  }

  if (filters.walletAddress) {
    where.user = { walletAddress: { contains: filters.walletAddress } };
  }

  if (filters.dateFrom || filters.dateTo) {
    where.submittedAt = {};
    if (filters.dateFrom) {
      (where.submittedAt as Record<string, Date>).gte = filters.dateFrom;
    }
    if (filters.dateTo) {
      (where.submittedAt as Record<string, Date>).lte = filters.dateTo;
    }
  }

  const orderBy: Record<string, 'asc' | 'desc'> = {};
  if (pagination.sortBy === 'taskName') {
    orderBy.task = { name: pagination.sortOrder } as unknown as 'asc' | 'desc';
  } else {
    orderBy[pagination.sortBy] = pagination.sortOrder;
  }

  const [submissions, total] = await Promise.all([
    prisma.taskSubmission.findMany({
      where,
      orderBy,
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
      include: {
        task: { select: { name: true, category: true } },
        user: { select: { walletAddress: true } },
      },
    }),
    prisma.taskSubmission.count({ where }),
  ]);

  const items: SubmissionListItem[] = submissions.map((sub) => ({
    id: sub.id,
    taskName: sub.task.name,
    taskCategory: sub.task.category,
    walletAddress: sub.user.walletAddress,
    walletShort: shortenWallet(sub.user.walletAddress),
    status: sub.status as SubmissionStatus,
    submittedAt: sub.submittedAt,
    hasProof: !!sub.proofFileKey,
    proofFileType: sub.proofFileType,
  }));

  return { items, total };
}

/**
 * Get detailed submission for review
 */
export async function getSubmissionDetail(
  submissionId: string,
  adminId: string
): Promise<SubmissionDetail> {
  const submission = await prisma.taskSubmission.findUnique({
    where: { id: submissionId },
    include: {
      task: true,
      user: true,
      moderationActions: {
        orderBy: { createdAt: 'desc' },
        include: {
          admin: { select: { email: true } },
        },
      },
    },
  });

  if (!submission) {
    throw Errors.notFound('Submission');
  }

  // Log view action for audit trail
  await prisma.moderationAction.create({
    data: {
      submissionId,
      adminId,
      action: 'VIEW',
      previousStatus: submission.status,
      newStatus: submission.status,
    },
  });

  // Generate signed URL for proof if exists
  let proofUrl: string | null = null;
  if (submission.proofFileKey) {
    proofUrl = await getSignedViewUrl(submission.proofFileKey);
  }

  return {
    id: submission.id,
    taskName: submission.task.name,
    taskCategory: submission.task.category,
    taskDescription: submission.task.description,
    rewardAmount: submission.task.rewardAmount.toString(),
    rewardToken: submission.task.rewardToken,
    walletAddress: submission.user.walletAddress,
    walletShort: shortenWallet(submission.user.walletAddress),
    status: submission.status as SubmissionStatus,
    submittedAt: submission.submittedAt,
    hasProof: !!submission.proofFileKey,
    proofFileType: submission.proofFileType,
    proofUrl,
    userNote: submission.userNote,
    reviewedBy: submission.reviewedById,
    reviewedAt: submission.reviewedAt,
    rejectionReason: submission.rejectionReason,
    moderationHistory: submission.moderationActions.map((action) => ({
      id: action.id,
      action: action.action as ActionType,
      previousStatus: action.previousStatus as SubmissionStatus,
      newStatus: action.newStatus as SubmissionStatus,
      adminEmail: action.admin.email,
      reason: action.reason,
      createdAt: action.createdAt,
    })),
  };
}

// =============================================================================
// MODERATION ACTIONS
// =============================================================================

/**
 * Approve a submission
 */
export async function approveSubmission(
  submissionId: string,
  adminId: string,
  moderatorNote?: string,
  txHash?: string
): Promise<void> {
  const submission = await prisma.taskSubmission.findUnique({
    where: { id: submissionId },
    include: {
      user: true,
      task: true,
    },
  });

  if (!submission) {
    throw Errors.notFound('Submission');
  }

  // Validate status transition
  if (!['PENDING', 'UNDER_REVIEW', 'FLAGGED'].includes(submission.status)) {
    throw Errors.badRequest(
      `Cannot approve submission with status: ${submission.status}`
    );
  }

  const previousStatus = submission.status;

  // Transaction: update submission and create audit log
  await prisma.$transaction(async (tx) => {
    // Update submission
    await tx.taskSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'APPROVED',
        reviewedById: adminId,
        reviewedAt: new Date(),
        moderatorNote,
        rewardTxHash: txHash, // Store Solscan transaction link
      },
    });

    // Create audit log
    await tx.moderationAction.create({
      data: {
        submissionId,
        adminId,
        action: 'APPROVE',
        previousStatus,
        newStatus: 'APPROVED',
        internalNote: moderatorNote,
      },
    });

    // Update user stats
    await tx.platformUser.update({
      where: { id: submission.userId },
      data: {
        totalApproved: { increment: 1 },
        totalPending: { decrement: 1 },
      },
    });
  });

  // Emit webhook to user app with transaction link
  await emitWebhook('submission.approved', {
    submissionId: submission.id,
    userId: submission.userId,
    walletAddress: submission.user.walletAddress,
    taskId: submission.taskId,
    taskName: submission.task.name,
    status: 'APPROVED',
    rewardAmount: submission.task.rewardAmount.toString(),
    rewardToken: submission.task.rewardToken,
    txHash, // Include Solscan link in webhook
  });
}

/**
 * Reject a submission
 */
export async function rejectSubmission(
  submissionId: string,
  adminId: string,
  reason: string,
  moderatorNote?: string
): Promise<void> {
  if (!reason || reason.trim().length === 0) {
    throw Errors.badRequest('Rejection reason is required');
  }

  const submission = await prisma.taskSubmission.findUnique({
    where: { id: submissionId },
    include: { user: true },
  });

  if (!submission) {
    throw Errors.notFound('Submission');
  }

  // Validate status transition
  if (!['PENDING', 'UNDER_REVIEW', 'FLAGGED'].includes(submission.status)) {
    throw Errors.badRequest(
      `Cannot reject submission with status: ${submission.status}`
    );
  }

  const previousStatus = submission.status;

  await prisma.$transaction(async (tx) => {
    await tx.taskSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'REJECTED',
        reviewedById: adminId,
        reviewedAt: new Date(),
        rejectionReason: reason,
        moderatorNote,
      },
    });

    await tx.moderationAction.create({
      data: {
        submissionId,
        adminId,
        action: 'REJECT',
        previousStatus,
        newStatus: 'REJECTED',
        reason,
        internalNote: moderatorNote,
      },
    });

    await tx.platformUser.update({
      where: { id: submission.userId },
      data: {
        totalRejected: { increment: 1 },
        totalPending: { decrement: 1 },
      },
    });
  });

  await emitWebhook('submission.rejected', {
    submissionId: submission.id,
    userId: submission.userId,
    walletAddress: submission.user.walletAddress,
    taskId: submission.taskId,
    status: 'REJECTED',
    reason,
  });
}

/**
 * Flag a submission for senior review
 */
export async function flagSubmission(
  submissionId: string,
  adminId: string,
  reason: string
): Promise<void> {
  const submission = await prisma.taskSubmission.findUnique({
    where: { id: submissionId },
  });

  if (!submission) {
    throw Errors.notFound('Submission');
  }

  if (submission.status !== 'PENDING' && submission.status !== 'UNDER_REVIEW') {
    throw Errors.badRequest('Can only flag pending or under review submissions');
  }

  const previousStatus = submission.status;

  await prisma.$transaction(async (tx) => {
    await tx.taskSubmission.update({
      where: { id: submissionId },
      data: { status: 'FLAGGED' },
    });

    await tx.moderationAction.create({
      data: {
        submissionId,
        adminId,
        action: 'FLAG',
        previousStatus,
        newStatus: 'FLAGGED',
        reason,
      },
    });
  });
}

// =============================================================================
// DASHBOARD STATS
// =============================================================================

/**
 * Get dashboard statistics
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [pendingCount, todayApproved, todayRejected, flaggedCount] =
    await Promise.all([
      prisma.taskSubmission.count({
        where: { status: 'PENDING' },
      }),
      prisma.taskSubmission.count({
        where: {
          status: 'APPROVED',
          reviewedAt: { gte: today },
        },
      }),
      prisma.taskSubmission.count({
        where: {
          status: 'REJECTED',
          reviewedAt: { gte: today },
        },
      }),
      prisma.taskSubmission.count({
        where: { status: 'FLAGGED' },
      }),
    ]);

  // Calculate average review time (for submissions reviewed today)
  const reviewedToday = await prisma.taskSubmission.findMany({
    where: {
      reviewedAt: { gte: today },
      status: { in: ['APPROVED', 'REJECTED'] },
    },
    select: {
      submittedAt: true,
      reviewedAt: true,
    },
  });

  let avgReviewTimeMs: number | null = null;
  if (reviewedToday.length > 0) {
    const totalMs = reviewedToday.reduce((sum, sub) => {
      if (sub.reviewedAt) {
        return sum + (sub.reviewedAt.getTime() - sub.submittedAt.getTime());
      }
      return sum;
    }, 0);
    avgReviewTimeMs = Math.round(totalMs / reviewedToday.length);
  }

  return {
    pendingCount,
    todayApproved,
    todayRejected,
    flaggedCount,
    avgReviewTimeMs,
  };
}

/**
 * Get task categories for filtering
 */
export async function getTaskCategories(): Promise<string[]> {
  const categories = await prisma.task.findMany({
    where: { isActive: true },
    select: { category: true },
    distinct: ['category'],
  });

  return categories.map((c) => c.category);
}
