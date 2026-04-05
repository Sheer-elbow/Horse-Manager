import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
} from 'prom-client';
import type { Request, Response, NextFunction } from 'express';
import { prisma } from './db';

export const register = new Registry();
register.setDefaultLabels({ app: 'horse-manager' });
collectDefaultMetrics({ register });

// ── HTTP metrics ───────────────────────────────────────────────────────────

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register],
});

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

// ── Business metrics ───────────────────────────────────────────────────────

/** Incremented each time a training session is successfully logged. */
export const sessionsCreatedTotal = new Counter({
  name: 'horse_sessions_created_total',
  help: 'Total training sessions logged via the app',
  registers: [register],
});

/** Polled every 30 s from the DB. */
export const horsesTotal = new Gauge({
  name: 'horse_manager_horses_total',
  help: 'Total number of horses in the system',
  registers: [register],
});

export const horsesEditedLast7Days = new Gauge({
  name: 'horse_manager_horses_edited_7d',
  help: 'Horses whose records were updated in the last 7 days',
  registers: [register],
});

export const usersTotal = new Gauge({
  name: 'horse_manager_users_total',
  help: 'Total number of user accounts',
  registers: [register],
});

export const activeUsersLast24h = new Gauge({
  name: 'horse_manager_active_users_24h',
  help: 'Distinct users with a successful login in the last 24 hours',
  registers: [register],
});

export const failedLoginsLast24h = new Gauge({
  name: 'horse_manager_failed_logins_24h',
  help: 'Failed login attempts in the last 24 hours',
  registers: [register],
});

// ── HTTP middleware ────────────────────────────────────────────────────────

function normalisePath(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid')
    .replace(/\/\d+/g, '/:id');
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const route = (req.route?.path as string | undefined) ?? normalisePath(req.path);
    const labels = { method: req.method, route, status: String(res.statusCode) };
    httpRequestDuration.observe(labels, durationSeconds);
    httpRequestsTotal.inc(labels);
  });
  next();
}

// ── Business gauge refresh (every 30 s) ───────────────────────────────────

type CountRow = { count: bigint }[];

async function refreshBusinessMetrics() {
  try {
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const cutoff7d  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      horses,
      horsesEdited,
      users,
      activeRows,
      failedRows,
    ] = await Promise.all([
      prisma.horse.count(),

      prisma.horse.count({
        where: { updatedAt: { gte: cutoff7d } },
      }),

      prisma.user.count(),

      // Distinct users with a LOGIN_SUCCESS in the last 24 h
      prisma.$queryRaw<CountRow>`
        SELECT COUNT(DISTINCT user_id)::bigint AS count
        FROM security_events
        WHERE event_type = 'LOGIN_SUCCESS'
          AND created_at >= ${cutoff24h}`,

      // All LOGIN_FAILURE events in the last 24 h
      prisma.$queryRaw<CountRow>`
        SELECT COUNT(*)::bigint AS count
        FROM security_events
        WHERE event_type = 'LOGIN_FAILURE'
          AND created_at >= ${cutoff24h}`,
    ]);

    horsesTotal.set(horses);
    horsesEditedLast7Days.set(horsesEdited);
    usersTotal.set(users);
    activeUsersLast24h.set(Number(activeRows[0]?.count ?? 0n));
    failedLoginsLast24h.set(Number(failedRows[0]?.count ?? 0n));
  } catch {
    // Never crash the server over a metrics refresh failure
  }
}

export function startMetricsRefresh() {
  void refreshBusinessMetrics();
  setInterval(() => void refreshBusinessMetrics(), 30_000);
}
