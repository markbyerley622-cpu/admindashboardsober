// =============================================================================
// AUTH ROUTES - Login, logout, token refresh
// =============================================================================
import { Router } from 'express';
import { z } from 'zod';
import * as authService from '../services/auth.js';
import { authenticate, requireSuperAdmin } from '../middleware/auth.js';
import { successResponse } from '../utils/index.js';
import type { AuthenticatedRequest } from '../types/index.js';

const router = Router();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const createAdminSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'READ_ONLY']).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(12, 'New password must be at least 12 characters'),
});

// =============================================================================
// PUBLIC ROUTES
// =============================================================================

/**
 * POST /auth/login
 * Authenticate admin and return tokens
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const result = await authService.login(
      email,
      password,
      req.ip,
      req.headers['user-agent']
    );

    res.json(successResponse({
      token: result.token,
      refreshToken: result.refreshToken,
      admin: result.admin,
    }));
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auth/refresh
 * Refresh access token
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const result = await authService.refreshAccessToken(refreshToken);

    res.json(successResponse({
      token: result.token,
      admin: result.admin,
    }));
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// PROTECTED ROUTES
// =============================================================================

/**
 * POST /auth/logout
 * Invalidate refresh token
 */
router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    await authService.logout(refreshToken);

    res.json(successResponse({ message: 'Logged out successfully' }));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /auth/me
 * Get current admin info
 */
router.get('/me', authenticate, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  res.json(successResponse({
    id: authReq.admin.id,
    email: authReq.admin.email,
    role: authReq.admin.role,
  }));
});

/**
 * POST /auth/change-password
 * Change current admin's password
 */
router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

    await authService.changePassword(
      authReq.admin.id,
      currentPassword,
      newPassword
    );

    res.json(successResponse({ message: 'Password changed successfully' }));
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// SUPER ADMIN ROUTES
// =============================================================================

/**
 * POST /auth/admins
 * Create new admin user (SUPER_ADMIN only)
 */
router.post('/admins', authenticate, requireSuperAdmin, async (req, res, next) => {
  try {
    const { email, password, role } = createAdminSchema.parse(req.body);
    const admin = await authService.createAdmin(email, password, role);

    res.status(201).json(successResponse(admin));
  } catch (error) {
    next(error);
  }
});

export default router;
