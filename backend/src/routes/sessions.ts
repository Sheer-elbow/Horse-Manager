import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { createAuditEntry } from '../services/audit';
import { AuthRequest } from '../types';

const router = Router();

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

    // Check access for non-admin
    if (req.user!.role !== 'ADMIN' && horseId) {
      const assignment = await prisma.horseAssignment.findUnique({
        where: { userId_horseId: { userId: req.user!.userId, horseId: horseId as string } },
      });
      if (!assignment) {
        res.status(403).json({ error: 'No access to this horse' });
        return;
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

// POST /api/sessions - create a session log (admin + trainer + rider)
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

    const session = await prisma.actualSessionLog.upsert({
      where: {
        horseId_date_slot: {
          horseId: data.horseId,
          date: new Date(data.date + 'T00:00:00Z'),
          slot: data.slot,
        },
      },
      create: {
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
      update: {
        sessionType: data.sessionType ?? null,
        durationMinutes: data.durationMinutes ?? null,
        intensityRpe: data.intensityRpe ?? null,
        notes: data.notes ?? null,
        rider: data.rider ?? null,
        deviationReason: data.deviationReason ?? null,
      },
    });

    res.json(session);
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
