import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { authenticate } from '../middleware/auth';
import { requireHorseAccess } from '../middleware/rbac';
import { AuthRequest, HorsePermissionRequest } from '../types';

const router = Router();

// ─── Plan Blocks ─────────────────────────────────────────────

const planBlockSchema = z.object({
  horseId: z.string().uuid(),
  programmeId: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  startDate: z.string(), // ISO date string (YYYY-MM-DD), must be a Monday
  numWeeks: z.number().int().min(1).max(52).default(6),
});

// GET /api/plans/blocks?horseId=xxx
router.get('/blocks', authenticate, async (req: AuthRequest, res: Response) => {
  const horseId = req.query.horseId as string | undefined;
  const where = horseId ? { horseId } : {};

  if (req.user!.role !== 'ADMIN' && !horseId) {
    // Non-admin must specify horse (access checked per horse)
    res.status(400).json({ error: 'horseId query parameter required' });
    return;
  }

  const blocks = await prisma.planBlock.findMany({
    where,
    include: {
      horse: { select: { id: true, name: true } },
      programme: { select: { id: true, name: true } },
    },
    orderBy: { startDate: 'desc' },
  });
  res.json(blocks);
});

// POST /api/plans/blocks
router.post('/blocks', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = planBlockSchema.parse(req.body);

    // Verify date is a Monday
    const d = new Date(data.startDate + 'T00:00:00Z');
    if (d.getUTCDay() !== 1) {
      res.status(400).json({ error: 'startDate must be a Monday' });
      return;
    }

    // Check horse access
    if (req.user!.role !== 'ADMIN') {
      const assignment = await prisma.horseAssignment.findUnique({
        where: { userId_horseId: { userId: req.user!.userId, horseId: data.horseId } },
      });
      if (!assignment || assignment.permission !== 'EDIT') {
        res.status(403).json({ error: 'Edit access required for this horse' });
        return;
      }
    }

    const block = await prisma.planBlock.create({
      data: {
        horseId: data.horseId,
        programmeId: data.programmeId ?? null,
        name: data.name,
        startDate: new Date(data.startDate + 'T00:00:00Z'),
        numWeeks: data.numWeeks,
      },
    });
    res.status(201).json(block);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Create plan block error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/plans/blocks/:id
router.delete('/blocks/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const block = await prisma.planBlock.findUnique({ where: { id: req.params.id } });
    if (!block) {
      res.status(404).json({ error: 'Plan block not found' });
      return;
    }

    if (req.user!.role !== 'ADMIN') {
      const assignment = await prisma.horseAssignment.findUnique({
        where: { userId_horseId: { userId: req.user!.userId, horseId: block.horseId } },
      });
      if (!assignment || assignment.permission !== 'EDIT') {
        res.status(403).json({ error: 'Edit access required' });
        return;
      }
    }

    await prisma.planBlock.delete({ where: { id: req.params.id } });
    res.json({ message: 'Plan block deleted' });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Planned Sessions ────────────────────────────────────────

const plannedSessionSchema = z.object({
  planBlockId: z.string().uuid(),
  horseId: z.string().uuid(),
  date: z.string(), // YYYY-MM-DD
  slot: z.enum(['AM', 'PM']),
  sessionType: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  durationMinutes: z.number().int().positive().nullable().optional(),
  intensityRpe: z.number().int().min(1).max(10).nullable().optional(),
  notes: z.string().nullable().optional(),
});

// Helper: check if a date's week is in the past (locked)
function isWeekLocked(dateStr: string): boolean {
  const date = new Date(dateStr + 'T00:00:00Z');
  const now = new Date();
  // Find Monday of the date's week
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() + mondayOffset);

  // Find Monday of current week
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayDay = today.getDay();
  const currentMondayOffset = todayDay === 0 ? -6 : 1 - todayDay;
  const currentMonday = new Date(today);
  currentMonday.setDate(currentMonday.getDate() + currentMondayOffset);

  return monday < currentMonday;
}

// GET /api/plans/sessions?horseId=xxx&blockId=yyy&weekStart=YYYY-MM-DD
router.get('/sessions', authenticate, async (req: AuthRequest, res: Response) => {
  const { horseId, blockId, weekStart } = req.query;

  const where: Record<string, unknown> = {};
  if (horseId) where.horseId = horseId;
  if (blockId) where.planBlockId = blockId;
  if (weekStart) {
    const start = new Date((weekStart as string) + 'T00:00:00Z');
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    where.date = { gte: start, lt: end };
  }

  const sessions = await prisma.plannedSession.findMany({
    where,
    include: { actualSession: true },
    orderBy: [{ date: 'asc' }, { slot: 'asc' }],
  });

  // Add locked flag
  const result = sessions.map((s) => ({
    ...s,
    _locked: isWeekLocked(s.date.toISOString().split('T')[0]),
  }));

  res.json(result);
});

// POST /api/plans/sessions
router.post('/sessions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = plannedSessionSchema.parse(req.body);

    // Check week lock
    if (isWeekLocked(data.date)) {
      res.status(400).json({ error: 'Cannot edit sessions in past weeks (locked)' });
      return;
    }

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

    const session = await prisma.plannedSession.upsert({
      where: { horseId_date_slot: { horseId: data.horseId, date: new Date(data.date + 'T00:00:00Z'), slot: data.slot } },
      create: {
        planBlockId: data.planBlockId,
        horseId: data.horseId,
        date: new Date(data.date + 'T00:00:00Z'),
        slot: data.slot,
        sessionType: data.sessionType ?? null,
        description: data.description ?? null,
        durationMinutes: data.durationMinutes ?? null,
        intensityRpe: data.intensityRpe ?? null,
        notes: data.notes ?? null,
      },
      update: {
        sessionType: data.sessionType ?? null,
        description: data.description ?? null,
        durationMinutes: data.durationMinutes ?? null,
        intensityRpe: data.intensityRpe ?? null,
        notes: data.notes ?? null,
      },
    });
    res.json(session);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Create planned session error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/plans/sessions/:id
router.put('/sessions/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.plannedSession.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (isWeekLocked(existing.date.toISOString().split('T')[0])) {
      res.status(400).json({ error: 'Cannot edit sessions in past weeks (locked)' });
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

    const data = plannedSessionSchema.partial().parse(req.body);
    const session = await prisma.plannedSession.update({
      where: { id: req.params.id },
      data: {
        sessionType: data.sessionType !== undefined ? (data.sessionType ?? null) : undefined,
        description: data.description !== undefined ? (data.description ?? null) : undefined,
        durationMinutes: data.durationMinutes !== undefined ? (data.durationMinutes ?? null) : undefined,
        intensityRpe: data.intensityRpe !== undefined ? (data.intensityRpe ?? null) : undefined,
        notes: data.notes !== undefined ? (data.notes ?? null) : undefined,
      },
    });
    res.json(session);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/plans/sessions/:id
router.delete('/sessions/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const existing = await prisma.plannedSession.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  if (isWeekLocked(existing.date.toISOString().split('T')[0])) {
    res.status(400).json({ error: 'Cannot delete sessions in past weeks (locked)' });
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
  await prisma.plannedSession.delete({ where: { id: req.params.id } });
  res.json({ message: 'Session deleted' });
});

// POST /api/plans/copy-week - Copy sessions from one week to another
const copyWeekSchema = z.object({
  horseId: z.string().uuid(),
  planBlockId: z.string().uuid(),
  sourceWeekStart: z.string(), // YYYY-MM-DD (Monday)
  targetWeekStart: z.string(), // YYYY-MM-DD (Monday)
});

router.post('/copy-week', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = copyWeekSchema.parse(req.body);

    if (isWeekLocked(data.targetWeekStart)) {
      res.status(400).json({ error: 'Target week is locked' });
      return;
    }

    if (req.user!.role !== 'ADMIN') {
      const assignment = await prisma.horseAssignment.findUnique({
        where: { userId_horseId: { userId: req.user!.userId, horseId: data.horseId } },
      });
      if (!assignment || assignment.permission !== 'EDIT') {
        res.status(403).json({ error: 'Edit access required' });
        return;
      }
    }

    const sourceStart = new Date(data.sourceWeekStart + 'T00:00:00Z');
    const sourceEnd = new Date(sourceStart);
    sourceEnd.setUTCDate(sourceEnd.getUTCDate() + 7);

    const sourceSessions = await prisma.plannedSession.findMany({
      where: {
        horseId: data.horseId,
        planBlockId: data.planBlockId,
        date: { gte: sourceStart, lt: sourceEnd },
      },
    });

    const targetStart = new Date(data.targetWeekStart + 'T00:00:00Z');
    const dayOffset = Math.round((targetStart.getTime() - sourceStart.getTime()) / (1000 * 60 * 60 * 24));

    const created = [];
    for (const session of sourceSessions) {
      const newDate = new Date(session.date);
      newDate.setUTCDate(newDate.getUTCDate() + dayOffset);

      const newSession = await prisma.plannedSession.upsert({
        where: {
          horseId_date_slot: {
            horseId: data.horseId,
            date: newDate,
            slot: session.slot,
          },
        },
        create: {
          planBlockId: data.planBlockId,
          horseId: data.horseId,
          date: newDate,
          slot: session.slot,
          sessionType: session.sessionType,
          description: session.description,
          durationMinutes: session.durationMinutes,
          intensityRpe: session.intensityRpe,
          notes: session.notes,
        },
        update: {
          sessionType: session.sessionType,
          description: session.description,
          durationMinutes: session.durationMinutes,
          intensityRpe: session.intensityRpe,
          notes: session.notes,
        },
      });
      created.push(newSession);
    }

    res.json({ message: `Copied ${created.length} sessions`, sessions: created });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Copy week error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
