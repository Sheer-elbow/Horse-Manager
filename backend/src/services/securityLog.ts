import { Prisma, SecurityEventType } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../db';

/**
 * Extract the real client IP, respecting a trusted reverse-proxy header.
 * If your deployment sits behind Nginx/Cloudflare, ensure APP_TRUST_PROXY=true
 * is set so Express populates req.ip correctly, or the X-Forwarded-For header
 * is passed through.
 */
function getIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

interface LogOptions {
  userId?: string;
  email?: string;
  outcome: 'success' | 'failure' | 'info';
  // Plain key-value pairs only — never put secrets or tokens here
  metadata?: Record<string, unknown>;
}

/**
 * Write a security event to the database.
 *
 * This is intentionally fire-and-forget: a logging failure must never
 * break the operation being logged. Always call with `void`.
 */
export async function logSecurityEvent(
  type: SecurityEventType,
  req: Request,
  options: LogOptions,
): Promise<void> {
  try {
    await prisma.securityEvent.create({
      data: {
        eventType: type,
        userId: options.userId ?? null,
        email: options.email ?? null,
        ipAddress: getIp(req),
        userAgent: req.headers['user-agent'] ?? null,
        outcome: options.outcome,
        metadata: (options.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    // Log to console but never re-throw — the caller must not fail
    console.error('[security-log] Failed to write event:', err instanceof Error ? err.message : err);
  }
}
