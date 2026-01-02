// =============================================================================
// AUTHENTICATION MIDDLEWARE - JWT verification and role-based access control
// =============================================================================
import type { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AdminRole } from '../types/index.js';
import { config } from '../config/index.js';
import type { AuthenticatedRequest, JWTPayload } from '../types/index.js';
import { errorResponse } from '../utils/index.js';

/**
 * Middleware to verify JWT token and attach admin info to request
 */
export function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json(
        errorResponse('UNAUTHORIZED', 'Missing or invalid authorization header')
      );
      return;
    }

    const token = authHeader.slice(7); // Remove "Bearer " prefix

    const payload = jwt.verify(token, config.jwtSecret) as JWTPayload;

    // Attach admin info to request for downstream use
    req.admin = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json(errorResponse('TOKEN_EXPIRED', 'Token has expired'));
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json(errorResponse('INVALID_TOKEN', 'Invalid token'));
      return;
    }
    res.status(500).json(errorResponse('AUTH_ERROR', 'Authentication failed'));
  }
}

/**
 * Role hierarchy for permission checks
 * Higher index = more permissions
 */
const ROLE_HIERARCHY: AdminRole[] = ['READ_ONLY', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN'];

function getRoleLevel(role: AdminRole): number {
  return ROLE_HIERARCHY.indexOf(role);
}

/**
 * Factory function to create role-checking middleware
 * Requires the admin to have at least the specified role level
 */
export function requireRole(minimumRole: AdminRole) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.admin) {
      res.status(401).json(errorResponse('UNAUTHORIZED', 'Not authenticated'));
      return;
    }

    const adminLevel = getRoleLevel(req.admin.role);
    const requiredLevel = getRoleLevel(minimumRole);

    if (adminLevel < requiredLevel) {
      res.status(403).json(
        errorResponse(
          'FORBIDDEN',
          `Requires ${minimumRole} role or higher`
        )
      );
      return;
    }

    next();
  };
}

/**
 * Convenience middleware combinations
 */
export const requireModerator = requireRole('MODERATOR');
export const requireAdmin = requireRole('ADMIN');
export const requireSuperAdmin = requireRole('SUPER_ADMIN');

/**
 * Middleware to check if admin can perform moderation actions
 * READ_ONLY users cannot approve/reject
 */
export function canModerate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.admin) {
    res.status(401).json(errorResponse('UNAUTHORIZED', 'Not authenticated'));
    return;
  }

  if (req.admin.role === 'READ_ONLY') {
    res.status(403).json(
      errorResponse('FORBIDDEN', 'Read-only users cannot perform moderation actions')
    );
    return;
  }

  next();
}
