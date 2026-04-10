import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { config } from '../config';
import { prisma } from '../db';
import { AuthRequest, JwtPayload } from '../types';

// Small in-process cache of { userId -> { version, expires } } so we don't
// hit the database on every authenticated request. 30-second TTL means a
// revoked token is rejected within 30s at most, while the steady-state cost
// of authenticate() stays essentially free.
const TOKEN_VERSION_TTL_MS = 30_000;
const tokenVersionCache = new Map<string, { version: number; expires: number }>();

async function getCurrentTokenVersion(userId: string): Promise<number | null> {
  const now = Date.now();
  const cached = tokenVersionCache.get(userId);
  if (cached && cached.expires > now) return cached.version;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tokenVersion: true },
  });
  if (!user) {
    tokenVersionCache.delete(userId);
    return null;
  }
  tokenVersionCache.set(userId, { version: user.tokenVersion, expires: now + TOKEN_VERSION_TTL_MS });
  return user.tokenVersion;
}

/** Test/admin hook: drop a user's cached tokenVersion so the next request re-reads from DB. */
export function invalidateTokenVersionCache(userId?: string): void {
  if (userId) tokenVersionCache.delete(userId);
  else tokenVersionCache.clear();
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7);
  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  try {
    const currentVersion = await getCurrentTokenVersion(payload.userId);
    if (currentVersion === null || currentVersion !== payload.tokenVersion) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
  } catch (err) {
    console.error('authenticate: tokenVersion check failed:', err);
    res.status(500).json({ error: 'Authentication error' });
    return;
  }

  req.user = payload;
  next();
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
