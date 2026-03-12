import { Router, Response } from 'express';
import { SecurityEventType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

// Every route under /api/security is admin-only.
// authenticate verifies the JWT; requireAdmin confirms the ADMIN role.
// Both checks run on every request — there is no way to reach any handler
// without a valid admin token.
router.use(authenticate, requireAdmin);

const PAGE_SIZE = 50;

const VALID_TYPES = Object.values(SecurityEventType) as [SecurityEventType, ...SecurityEventType[]];

// GET /api/security/summary
// Returns counts and highlights for the overview tab.
router.get('/summary', async (_req, res: Response) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      loginsToday,
      failedLoginsLast24h,
      accountChangesLast7d,
      pendingInvites,
      recentAlerts,
      topFailingIps,
      topFailingEmails,
    ] = await Promise.all([
      prisma.securityEvent.count({
        where: { eventType: 'LOGIN_SUCCESS', createdAt: { gte: startOfToday } },
      }),
      prisma.securityEvent.count({
        where: { eventType: 'LOGIN_FAILURE', createdAt: { gte: last24h } },
      }),
      prisma.securityEvent.count({
        where: {
          eventType: { in: ['ROLE_CHANGED', 'USER_DELETED', 'INVITE_SENT', 'INVITE_ACCEPTED'] },
          createdAt: { gte: last7d },
        },
      }),
      prisma.inviteToken.count({
        where: { usedAt: null, expiresAt: { gt: now } },
      }),
      prisma.securityEvent.findMany({
        where: { outcome: 'failure', createdAt: { gte: last24h } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          eventType: true,
          email: true,
          ipAddress: true,
          outcome: true,
          metadata: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      // IPs with the most failed login attempts in 24 h
      prisma.securityEvent.groupBy({
        by: ['ipAddress'],
        where: { eventType: 'LOGIN_FAILURE', createdAt: { gte: last24h } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      // Email addresses most frequently targeted by failed logins in 24 h
      prisma.securityEvent.groupBy({
        by: ['email'],
        where: {
          eventType: 'LOGIN_FAILURE',
          createdAt: { gte: last24h },
          email: { not: null },
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
    ]);

    res.json({
      loginsToday,
      failedLoginsLast24h,
      accountChangesLast7d,
      pendingInvites,
      recentAlerts,
      topFailingIps: topFailingIps.map((r) => ({
        ip: r.ipAddress,
        count: r._count.id,
      })),
      topFailingEmails: topFailingEmails.map((r) => ({
        email: r.email,
        count: r._count.id,
      })),
    });
  } catch (err) {
    console.error('Security summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/security/events?page=1&type=LOGIN_FAILURE&outcome=failure
// Paginated, filterable full event log.
const eventQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  type: z.enum(VALID_TYPES).optional(),
  outcome: z.enum(['success', 'failure', 'info']).optional(),
});

router.get('/events', async (req, res: Response) => {
  try {
    const query = eventQuerySchema.parse(req.query);
    const skip = (query.page - 1) * PAGE_SIZE;

    const where = {
      ...(query.type ? { eventType: query.type } : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
    };

    const [events, total] = await Promise.all([
      prisma.securityEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: PAGE_SIZE,
        select: {
          id: true,
          eventType: true,
          email: true,
          ipAddress: true,
          userAgent: true,
          outcome: true,
          metadata: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.securityEvent.count({ where }),
    ]);

    res.json({ events, total, page: query.page, pageSize: PAGE_SIZE });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid query', details: err.errors });
      return;
    }
    console.error('Security events error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
