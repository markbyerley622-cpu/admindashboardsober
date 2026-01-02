// =============================================================================
// SUBMISSIONS ROUTES - Task submission management
// =============================================================================
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, canModerate } from '../middleware/auth.js';
import * as moderationService from '../services/moderation.js';
import { successResponse, parsePagination, calculateTotalPages } from '../utils/index.js';
import type { AuthenticatedRequest, SubmissionFilters, PaginationParams, SubmissionStatus } from '../types/index.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Validation schemas
const rejectSchema = z.object({
  reason: z.string().min(10, 'Rejection reason must be at least 10 characters'),
  moderatorNote: z.string().optional(),
});

const approveSchema = z.object({
  moderatorNote: z.string().optional(),
  txHash: z.string().url().optional(), // Solscan transaction link
});

const flagSchema = z.object({
  reason: z.string().min(5, 'Flag reason is required'),
});

// =============================================================================
// QUEUE ENDPOINTS
// =============================================================================

/**
 * GET /submissions
 * Get paginated list of submissions with filters
 */
router.get('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;

    // Parse filters
    const filters: SubmissionFilters = {};
    if (req.query.status) {
      filters.status = req.query.status as SubmissionStatus;
    }
    if (req.query.category) {
      filters.taskCategory = req.query.category as string;
    }
    if (req.query.wallet) {
      filters.walletAddress = req.query.wallet as string;
    }
    if (req.query.from) {
      filters.dateFrom = new Date(req.query.from as string);
    }
    if (req.query.to) {
      filters.dateTo = new Date(req.query.to as string);
    }

    // Parse pagination
    const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
    const pagination: PaginationParams = {
      page,
      limit,
      sortBy: (req.query.sortBy as 'submittedAt' | 'status' | 'taskName') || 'submittedAt',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
    };

    const { items, total } = await moderationService.getSubmissions(filters, pagination);

    res.json(successResponse(items, {
      page,
      limit,
      total,
      totalPages: calculateTotalPages(total, limit),
    }));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /submissions/stats
 * Get dashboard statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await moderationService.getDashboardStats();
    res.json(successResponse(stats));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /submissions/categories
 * Get task categories for filtering
 */
router.get('/categories', async (req, res, next) => {
  try {
    const categories = await moderationService.getTaskCategories();
    res.json(successResponse(categories));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /submissions/:id
 * Get submission detail for review
 */
router.get('/:id', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const submission = await moderationService.getSubmissionDetail(
      req.params.id,
      authReq.admin.id
    );

    res.json(successResponse(submission));
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// MODERATION ACTIONS
// =============================================================================

/**
 * POST /submissions/:id/approve
 * Approve a submission
 */
router.post('/:id/approve', canModerate, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { moderatorNote, txHash } = approveSchema.parse(req.body || {});

    await moderationService.approveSubmission(
      req.params.id,
      authReq.admin.id,
      moderatorNote,
      txHash
    );

    res.json(successResponse({ message: 'Submission approved' }));
  } catch (error) {
    next(error);
  }
});

/**
 * POST /submissions/:id/reject
 * Reject a submission
 */
router.post('/:id/reject', canModerate, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { reason, moderatorNote } = rejectSchema.parse(req.body);

    await moderationService.rejectSubmission(
      req.params.id,
      authReq.admin.id,
      reason,
      moderatorNote
    );

    res.json(successResponse({ message: 'Submission rejected' }));
  } catch (error) {
    next(error);
  }
});

/**
 * POST /submissions/:id/flag
 * Flag a submission for senior review
 */
router.post('/:id/flag', canModerate, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { reason } = flagSchema.parse(req.body);

    await moderationService.flagSubmission(
      req.params.id,
      authReq.admin.id,
      reason
    );

    res.json(successResponse({ message: 'Submission flagged for review' }));
  } catch (error) {
    next(error);
  }
});

export default router;
