// =============================================================================
// AUTH SERVICE - Authentication and session management
// =============================================================================
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { AdminUser } from '@prisma/client';
import type { AdminRole } from '../types/index.js';
import { prisma } from './database.js';
import { config } from '../config/index.js';
import { sha256, generateSecureToken } from '../utils/index.js';
import type { JWTPayload } from '../types/index.js';
import { Errors } from '../middleware/errorHandler.js';

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.bcryptRounds);
}

/**
 * Verify a password against its hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a JWT token for an admin user
 */
export function generateToken(admin: Pick<AdminUser, 'id' | 'email' | 'role'>): string {
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    sub: admin.id,
    email: admin.email,
    role: admin.role,
  };

  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

/**
 * Generate a refresh token
 */
export function generateRefreshToken(): string {
  return generateSecureToken(48);
}

/**
 * Login an admin user
 */
export async function login(
  email: string,
  password: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ token: string; refreshToken: string; admin: Omit<AdminUser, 'passwordHash'> }> {
  // Find admin by email
  const admin = await prisma.adminUser.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!admin) {
    throw Errors.unauthorized('Invalid email or password');
  }

  // Check if admin is active
  if (!admin.isActive) {
    throw Errors.forbidden('Account is deactivated');
  }

  // Verify password
  const isValid = await verifyPassword(password, admin.passwordHash);
  if (!isValid) {
    throw Errors.unauthorized('Invalid email or password');
  }

  // Generate tokens
  const token = generateToken(admin);
  const refreshToken = generateRefreshToken();

  // Store session with hashed refresh token
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

  await prisma.adminSession.create({
    data: {
      adminId: admin.id,
      tokenHash: sha256(refreshToken),
      expiresAt,
      ipAddress,
      userAgent,
    },
  });

  // Update last login
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  // Remove password hash from response
  const { passwordHash: _, ...adminWithoutPassword } = admin;

  return {
    token,
    refreshToken,
    admin: adminWithoutPassword,
  };
}

/**
 * Refresh an access token using a refresh token
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ token: string; admin: Omit<AdminUser, 'passwordHash'> }> {
  const tokenHash = sha256(refreshToken);

  // Find session
  const session = await prisma.adminSession.findFirst({
    where: {
      tokenHash,
      expiresAt: { gt: new Date() },
    },
    include: { admin: true },
  });

  if (!session) {
    throw Errors.unauthorized('Invalid or expired refresh token');
  }

  if (!session.admin.isActive) {
    throw Errors.forbidden('Account is deactivated');
  }

  // Generate new access token
  const token = generateToken(session.admin);
  const { passwordHash: _, ...adminWithoutPassword } = session.admin;

  return {
    token,
    admin: adminWithoutPassword,
  };
}

/**
 * Logout - invalidate a refresh token
 */
export async function logout(refreshToken: string): Promise<void> {
  const tokenHash = sha256(refreshToken);

  await prisma.adminSession.deleteMany({
    where: { tokenHash },
  });
}

/**
 * Logout all sessions for an admin
 */
export async function logoutAll(adminId: string): Promise<void> {
  await prisma.adminSession.deleteMany({
    where: { adminId },
  });
}

/**
 * Create a new admin user (requires SUPER_ADMIN)
 */
export async function createAdmin(
  email: string,
  password: string,
  role: AdminRole = 'MODERATOR'
): Promise<Omit<AdminUser, 'passwordHash'>> {
  const passwordHash = await hashPassword(password);

  const admin = await prisma.adminUser.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      role,
    },
  });

  const { passwordHash: _, ...adminWithoutPassword } = admin;
  return adminWithoutPassword;
}

/**
 * Change admin password
 */
export async function changePassword(
  adminId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
  });

  if (!admin) {
    throw Errors.notFound('Admin user');
  }

  const isValid = await verifyPassword(currentPassword, admin.passwordHash);
  if (!isValid) {
    throw Errors.unauthorized('Current password is incorrect');
  }

  const newHash = await hashPassword(newPassword);

  await prisma.adminUser.update({
    where: { id: adminId },
    data: { passwordHash: newHash },
  });

  // Invalidate all existing sessions
  await logoutAll(adminId);
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.adminSession.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });

  return result.count;
}
