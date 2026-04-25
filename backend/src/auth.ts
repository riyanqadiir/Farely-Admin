import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { AdminRole } from './types';

interface AccessClaims {
  sub: string;
  role: AdminRole;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  admin?: AccessClaims;
}

const accessSecret = (): string => process.env.ADMIN_JWT_SECRET || 'dev-admin-secret';
const accessTtl = (): string => process.env.ADMIN_ACCESS_TTL || '15m';
const refreshTtlDays = (): number => Number(process.env.ADMIN_REFRESH_TTL_DAYS || 30);

export const signAccessToken = (claims: AccessClaims): string =>
  jwt.sign(claims, accessSecret(), { expiresIn: accessTtl() });

export const hashPassword = async (raw: string): Promise<string> => bcrypt.hash(raw, 10);
export const comparePassword = async (raw: string, hash: string): Promise<boolean> => bcrypt.compare(raw, hash);
export const hashToken = (raw: string): string => crypto.createHash('sha256').update(raw).digest('hex');

export const issueRefreshToken = (): { token: string; expiresAt: Date } => {
  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + refreshTtlDays() * 24 * 60 * 60 * 1000);
  return { token, expiresAt };
};

export const expiresInSec = (): number => 15 * 60;

export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const raw = req.headers.authorization || '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : '';
  if (!token) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing access token' } });
    return;
  }

  try {
    const decoded = jwt.verify(token, accessSecret()) as AccessClaims;
    req.admin = decoded;
    next();
  } catch (_err) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid access token' } });
  }
};

export const requireRole = (roles: AdminRole[]) => (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const role = req.admin?.role;
  if (!role || !roles.includes(role)) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient role permissions' } });
    return;
  }
  next();
};
