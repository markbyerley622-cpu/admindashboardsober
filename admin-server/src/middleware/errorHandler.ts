// =============================================================================
// ERROR HANDLING MIDDLEWARE - Centralized error handling
// =============================================================================
import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { config } from '../config/index.js';
import { errorResponse } from '../utils/index.js';

/**
 * Custom application error class
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Factory functions for common errors
 */
export const Errors = {
  notFound: (resource: string) =>
    new AppError(404, 'NOT_FOUND', `${resource} not found`),

  badRequest: (message: string, details?: unknown) =>
    new AppError(400, 'BAD_REQUEST', message, details),

  unauthorized: (message = 'Unauthorized') =>
    new AppError(401, 'UNAUTHORIZED', message),

  forbidden: (message = 'Forbidden') =>
    new AppError(403, 'FORBIDDEN', message),

  conflict: (message: string) =>
    new AppError(409, 'CONFLICT', message),

  tooManyRequests: (message = 'Too many requests') =>
    new AppError(429, 'TOO_MANY_REQUESTS', message),

  internal: (message = 'Internal server error') =>
    new AppError(500, 'INTERNAL_ERROR', message),
};

/**
 * Global error handler middleware
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error in development
  if (config.nodeEnv === 'development') {
    console.error('Error:', err);
  }

  // Handle known error types
  if (err instanceof AppError) {
    res.status(err.statusCode).json(
      errorResponse(err.code, err.message, err.details)
    );
    return;
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json(
      errorResponse('VALIDATION_ERROR', 'Validation failed', {
        issues: err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    );
    return;
  }

  // Handle Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': // Unique constraint violation
        res.status(409).json(
          errorResponse('DUPLICATE_ENTRY', 'Resource already exists')
        );
        return;
      case 'P2025': // Record not found
        res.status(404).json(
          errorResponse('NOT_FOUND', 'Resource not found')
        );
        return;
      default:
        break;
    }
  }

  // Handle Prisma validation errors
  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json(
      errorResponse('VALIDATION_ERROR', 'Invalid data provided')
    );
    return;
  }

  // Default to 500 for unknown errors
  const message = config.nodeEnv === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(500).json(errorResponse('INTERNAL_ERROR', message));
}

/**
 * 404 handler for undefined routes
 */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json(errorResponse('NOT_FOUND', 'Route not found'));
}
