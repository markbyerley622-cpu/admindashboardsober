// =============================================================================
// TYPE DEFINITIONS - Shared types for the admin verification system
// =============================================================================
import type { Request } from 'express';
// Type aliases (SQLite uses strings instead of enums)
export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR' | 'READ_ONLY';
export type SubmissionStatus = 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'REWARD_PENDING' | 'REWARD_PAID' | 'EXPIRED' | 'FLAGGED';
export type ActionType = 'VIEW' | 'APPROVE' | 'REJECT' | 'FLAG' | 'UNFLAG' | 'ESCALATE' | 'REVERT' | 'SUSPEND_USER' | 'UNSUSPEND_USER';

// =============================================================================
// AUTH TYPES
// =============================================================================
export interface JWTPayload {
  sub: string;        // Admin user ID
  email: string;
  role: AdminRole;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  admin: {
    id: string;
    email: string;
    role: AdminRole;
  };
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

// =============================================================================
// SUBMISSION TYPES
// =============================================================================
export interface SubmissionListItem {
  id: string;
  taskName: string;
  taskCategory: string;
  walletAddress: string;
  walletShort: string;
  status: SubmissionStatus;
  submittedAt: Date;
  hasProof: boolean;
  proofFileType: string | null;
}

export interface SubmissionDetail extends SubmissionListItem {
  taskDescription: string;
  rewardAmount: string;
  rewardToken: string;
  userNote: string | null;
  proofUrl: string | null;  // Signed URL
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  moderationHistory: ModerationHistoryItem[];
}

export interface ModerationHistoryItem {
  id: string;
  action: ActionType;
  previousStatus: SubmissionStatus;
  newStatus: SubmissionStatus;
  adminEmail: string;
  reason: string | null;
  createdAt: Date;
}

// =============================================================================
// QUEUE FILTER TYPES
// =============================================================================
export interface SubmissionFilters {
  status?: SubmissionStatus;
  taskCategory?: string;
  walletAddress?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy: 'submittedAt' | 'status' | 'taskName';
  sortOrder: 'asc' | 'desc';
}

// =============================================================================
// MODERATION ACTION TYPES
// =============================================================================
export interface ApproveSubmissionInput {
  submissionId: string;
  moderatorNote?: string;
}

export interface RejectSubmissionInput {
  submissionId: string;
  reason: string;
  moderatorNote?: string;
}

export interface FlagSubmissionInput {
  submissionId: string;
  reason: string;
}

// =============================================================================
// WEBHOOK TYPES
// =============================================================================
export type WebhookEventType =
  | 'submission.approved'
  | 'submission.rejected'
  | 'submission.flagged'
  | 'user.suspended'
  | 'reward.pending'
  | 'reward.paid';

export interface WebhookPayload {
  eventType: WebhookEventType;
  timestamp: string;
  data: {
    submissionId?: string;
    userId?: string;
    walletAddress?: string;
    taskId?: string;
    taskName?: string;
    status?: SubmissionStatus;
    rewardAmount?: string;
    rewardToken?: string;
    reason?: string;
    txHash?: string;
  };
}

// =============================================================================
// STATS TYPES
// =============================================================================
export interface DashboardStats {
  pendingCount: number;
  todayApproved: number;
  todayRejected: number;
  flaggedCount: number;
  avgReviewTimeMs: number | null;
}

export interface ModeratorStats {
  adminId: string;
  adminEmail: string;
  totalReviewed: number;
  approved: number;
  rejected: number;
  avgReviewTimeMs: number;
}
