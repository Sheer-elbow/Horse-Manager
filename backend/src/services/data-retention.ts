import { prisma } from '../db';

// Retention periods (configurable via environment in the future)
const SECURITY_EVENT_RETENTION_DAYS = 90;
const USED_TOKEN_RETENTION_DAYS = 30;

/**
 * Purge data that has exceeded its retention period.
 * Designed to be called on a schedule (e.g. daily via cron or setInterval).
 */
export async function runDataRetentionCleanup(): Promise<void> {
  const now = new Date();

  const securityCutoff = new Date(now.getTime() - SECURITY_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const tokenCutoff = new Date(now.getTime() - USED_TOKEN_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  try {
    // 1. Purge old security events (IP addresses are personal data)
    const { count: securityEvents } = await prisma.securityEvent.deleteMany({
      where: { createdAt: { lt: securityCutoff } },
    });

    // 2. Purge used or expired invite tokens
    const { count: inviteTokens } = await prisma.inviteToken.deleteMany({
      where: {
        OR: [
          { AND: [{ usedAt: { not: null } }, { usedAt: { lt: tokenCutoff } }] },
          { expiresAt: { lt: tokenCutoff } },
        ],
      },
    });

    // 3. Purge used or expired password reset tokens
    const { count: resetTokens } = await prisma.passwordResetToken.deleteMany({
      where: {
        OR: [
          { AND: [{ usedAt: { not: null } }, { usedAt: { lt: tokenCutoff } }] },
          { expiresAt: { lt: tokenCutoff } },
        ],
      },
    });

    if (securityEvents > 0 || inviteTokens > 0 || resetTokens > 0) {
      console.log(
        `[data-retention] Cleaned up: ${securityEvents} security events, ` +
        `${inviteTokens} invite tokens, ${resetTokens} password reset tokens`
      );
    }
  } catch (err) {
    console.error('[data-retention] Cleanup failed:', err instanceof Error ? err.message : err);
  }
}

/**
 * Start the data retention scheduler — runs cleanup once daily.
 */
export function startDataRetentionScheduler(): void {
  // Run once on startup (delayed by 60s to let the app settle)
  setTimeout(() => void runDataRetentionCleanup(), 60_000);

  // Then run every 24 hours
  setInterval(() => void runDataRetentionCleanup(), 24 * 60 * 60 * 1000);

  console.log('[data-retention] Scheduler started (runs daily)');
}
