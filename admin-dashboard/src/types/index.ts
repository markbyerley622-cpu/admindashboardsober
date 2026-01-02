// =============================================================================
// TYPE DEFINITIONS - Admin Dashboard Types
// =============================================================================

export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR' | 'READ_ONLY';

export type SubmissionStatus =
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'REWARD_PENDING'
  | 'REWARD_PAID'
  | 'EXPIRED'
  | 'FLAGGED';

export type ActionType =
  | 'VIEW'
  | 'APPROVE'
  | 'REJECT'
  | 'FLAG'
  | 'UNFLAG'
  | 'ESCALATE'
  | 'REVERT'
  | 'SUSPEND_USER'
  | 'UNSUSPEND_USER';

export interface Admin {
  id: string;
  email: string;
  role: AdminRole;
}

export interface AuthState {
  token: string | null;
  refreshToken: string | null;
  admin: Admin | null;
  isAuthenticated: boolean;
}

export interface ApiResponse<T> {
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

export interface SubmissionListItem {
  id: string;
  taskName: string;
  taskCategory: string;
  walletAddress: string;
  walletShort: string;
  status: SubmissionStatus;
  submittedAt: string;
  hasProof: boolean;
  proofFileType: string | null;
}

export interface ModerationHistoryItem {
  id: string;
  action: ActionType;
  previousStatus: SubmissionStatus;
  newStatus: SubmissionStatus;
  adminEmail: string;
  reason: string | null;
  createdAt: string;
}

export interface SubmissionDetail extends SubmissionListItem {
  taskDescription: string;
  rewardAmount: string;
  rewardToken: string;
  userNote: string | null;
  proofUrl: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  moderationHistory: ModerationHistoryItem[];
}

export interface DashboardStats {
  pendingCount: number;
  todayApproved: number;
  todayRejected: number;
  flaggedCount: number;
  avgReviewTimeMs: number | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  refreshToken: string;
  admin: Admin;
}
