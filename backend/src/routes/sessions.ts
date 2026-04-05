import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { createAuditEntry } from '../services/audit';
import { AuthRequest } from '../types';

const router = Router();

function weekSessions(
  sessions: { date: Date; durationMinutes: number | null; intensityRpe: number | null }[],
  from: Date,
  to: Date,
) {
  return sessions.filter((s) => {
    const d = new Date(s.date);
    return d >= from && d < to;
  });
}

const sessionLogSchema = z.object({
  horseId: z.string().uuid(),
  date: z.string(), // YYYY-MM-DD
  slot: z.enum(['AM', 'PM']),
  plannedSessionId: z.string().uuid().nullable().optional(),
  sessionType: z.string().nullable().optional(),
  durationMinutes: z.number().int().positive().nullable().optional(),
  intensityRpe: z.number().int().min(1).max(10).nullable().optional(),
  notes: z.string().nullable().optional(),
  rider: z.string().nullable().optional(),
  deviationReason: z.string().nullable().optional(),
});

// GET /api/sessions?horseId=xxx&weekStart=YYYY-MM-DD
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { horseId, weekStart, date } = req.query;

    const where: Record<string, unknown> = {};
    if (horseId) where.horseId = horseId;
    if (date) {
      where.date = new Date((date as string) + 'T00:00:00Z');
    } else if (weekStart) {
      const start = new Date((weekStart as string) + 'T00:00:00Z');
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 7);
      where.date = { gte: start, lt: end };
    }

    // Enforce horse-level access for non-admins
    if (req.user!.role !== 'ADMIN') {
      if (horseId) {
        // Specific horse requested — verify the user is assigned to it
        const assignment = await prisma.horseAssignment.findUnique({
          where: { userId_horseId: { userId: req.user!.userId, horseId: horseId as string } },
        });
        if (!assignment) {
          res.status(403).json({ error: 'No access to this horse' });
          return;
        }
      } else {
        // No specific horse — restrict to only the horses this user is assigned to.
        // Without this, a non-admin could enumerate all session logs across the
        // entire system by omitting the horseId query parameter.
        const assignments = await prisma.horseAssignment.findMany({
          where: { userId: req.user!.userId },
          select: { horseId: true },
        });
        const accessibleHorseIds = assignments.map((a) => a.horseId);
        where.horseId = { in: accessibleHorseIds };
      }
    }

    const sessions = await prisma.actualSessionLog.findMany({
      where,
      include: {
        plannedSession: true,
        createdBy: { select: { id: true, name: true, email: true } },
        auditLogs: { select: { id: true, editedAt: true }, orderBy: { editedAt: 'desc' }, take: 1 },
      },
      orderBy: [{ date: 'asc' }, { slot: 'asc' }],
    });

    const result = sessions.map((s) => ({
      ...s,
      _edited: s.auditLogs.length > 0,
    }));

    res.json(result);
  } catch (err) {
    console.error('List sessions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/sessions/analytics?horseId=xxx&weeks=12
// Returns weekly training load buckets (totalMinutes, avgRpe, sessionCount)
router.get('/analytics', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { horseId, weeks: weeksParam = '12' } = req.query;

    if (!horseId) {
      res.status(400).json({ error: 'horseId is required' });
      return;
    }

    const numWeeks = Math.min(Math.max(parseInt(weeksParam as string) || 12, 4), 52);

    // Access control
    if (req.user!.role !== 'ADMIN') {
      const assignment = await prisma.horseAssignment.findUnique({
        where: { userId_horseId: { userId: req.user!.userId, horseId: horseId as string } },
      });
      if (!assignment) {
        res.status(403).json({ error: 'No access to this horse' });
        return;
      }
    }

    // Start of the current week (Monday UTC)
    const now = new Date();
    const dow = now.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat
    const daysToMonday = dow === 0 ? 6 : dow - 1;
    const thisMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysToMonday));

    const rangeStart = new Date(thisMonday);
    rangeStart.setUTCDate(thisMonday.getUTCDate() - (numWeeks - 1) * 7);

    const sessions = await prisma.actualSessionLog.findMany({
      where: {
        horseId: horseId as string,
        date: { gte: rangeStart },
      },
      select: { date: true, durationMinutes: true, intensityRpe: true },
      orderBy: { date: 'asc' },
    });

    const buckets = Array.from({ length: numWeeks }, (_, i) => {
      const weekStart = new Date(rangeStart);
      weekStart.setUTCDate(rangeStart.getUTCDate() + i * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekStart.getUTCDate() + 7);

      const ws = weekSessions(sessions, weekStart, weekEnd);
      const totalMinutes = ws.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);
      const rpeValues = ws.map((s) => s.intensityRpe).filter((v): v is number => v != null);
      const avgRpe = rpeValues.length > 0
        ? Math.round((rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length) * 10) / 10
        : null;

      return {
        weekLabel: weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
        weekStart: weekStart.toISOString().split('T')[0],
        totalMinutes,
        avgRpe,
        sessionCount: ws.length,
      };
    });

    res.json(buckets);
  } catch (err) {
    console.error('Sessions analytics error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
router.post('/', authenticate, requireRole('ADMIN', 'TRAINER', 'RIDER'), async (req: AuthRequest, res: Response) => {
  try {
    const data = sessionLogSchema.parse(req.body);

    // Check access
    if (req.user!.role !== 'ADMIN') {
      const assignment = await prisma.horseAssignment.findUnique({
        where: { userId_horseId: { userId: req.user!.userId, horseId: data.horseId } },
      });
      if (!assignment || assignment.permission !== 'EDIT') {
        res.status(403).json({ error: 'Edit access required' });
        return;
      }
    }

    const session = await prisma.actualSessionLog.create({
      data: {
        horseId: data.horseId,
        date: new Date(data.date + 'T00:00:00Z'),
        slot: data.slot,
        plannedSessionId: data.plannedSessionId ?? null,
        sessionType: data.sessionType ?? null,
        durationMinutes: data.durationMinutes ?? null,
        intensityRpe: data.intensityRpe ?? null,
        notes: data.notes ?? null,
        rider: data.rider ?? null,
        deviationReason: data.deviationReason ?? null,
        createdById: req.user!.userId,
      },
    });

    res.status(201).json(session);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Create session log error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/sessions/:id - edit with audit trail (admin + trainer + rider)
router.put('/:id', authenticate, requireRole('ADMIN', 'TRAINER', 'RIDER'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.actualSessionLog.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'Session log not found' });
      return;
    }

    if (req.user!.role !== 'ADMIN') {
      const assignment = await prisma.horseAssignment.findUnique({
        where: { userId_horseId: { userId: req.user!.userId, horseId: existing.horseId } },
      });
      if (!assignment || assignment.permission !== 'EDIT') {
        res.status(403).json({ error: 'Edit access required' });
        return;
      }
    }

    const data = sessionLogSchema.partial().parse(req.body);

    // Snapshot previous data for audit
    const previousData = {
      sessionType: existing.sessionType,
      durationMinutes: existing.durationMinutes,
      intensityRpe: existing.intensityRpe,
      notes: existing.notes,
      rider: existing.rider,
      deviationReason: existing.deviationReason,
    };

    const updated = await prisma.actualSessionLog.update({
      where: { id: req.params.id },
      data: {
        sessionType: data.sessionType !== undefined ? (data.sessionType ?? null) : undefined,
        durationMinutes: data.durationMinutes !== undefined ? (data.durationMinutes ?? null) : undefined,
        intensityRpe: data.intensityRpe !== undefined ? (data.intensityRpe ?? null) : undefined,
        notes: data.notes !== undefined ? (data.notes ?? null) : undefined,
        rider: data.rider !== undefined ? (data.rider ?? null) : undefined,
        deviationReason: data.deviationReason !== undefined ? (data.deviationReason ?? null) : undefined,
      },
    });

    const newData = {
      sessionType: updated.sessionType,
      durationMinutes: updated.durationMinutes,
      intensityRpe: updated.intensityRpe,
      notes: updated.notes,
      rider: updated.rider,
      deviationReason: updated.deviationReason,
    };

    // Create audit entry
    await createAuditEntry(existing.id, req.user!.userId, previousData, newData);

    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Update session log error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/sessions/:id (admin + trainer + rider who created it)
router.delete('/:id', authenticate, requireRole('ADMIN', 'TRAINER', 'RIDER'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.actualSessionLog.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'Session log not found' });
      return;
    }

    if (req.user!.role !== 'ADMIN') {
      const assignment = await prisma.horseAssignment.findUnique({
        where: { userId_horseId: { userId: req.user!.userId, horseId: existing.horseId } },
      });
      if (!assignment || assignment.permission !== 'EDIT') {
        res.status(403).json({ error: 'Edit access required' });
        return;
      }
    }

    await prisma.actualSessionLog.delete({ where: { id: req.params.id } });
    res.json({ message: 'Session log deleted' });
  } catch (err) {
    console.error('Delete session log error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/sessions/:id/audit - get audit history for a session
router.get('/:id/audit', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const session = await prisma.actualSessionLog.findUnique({
      where: { id: req.params.id },
      select: { horseId: true },
    });
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (req.user!.role !== 'ADMIN') {
      const assignment = await prisma.horseAssignment.findUnique({
        where: { userId_horseId: { userId: req.user!.userId, horseId: session.horseId } },
      });
      if (!assignment) {
        res.status(403).json({ error: 'No access to this horse' });
        return;
      }
    }

    const auditLogs = await prisma.sessionAuditLog.findMany({
      where: { actualSessionLogId: req.params.id },
      include: { editedBy: { select: { id: true, name: true, email: true } } },
      orderBy: { editedAt: 'desc' },
    });
    res.json(auditLogs);
  } catch (err) {
    console.error('Get audit log error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
