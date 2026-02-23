import { Router, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ScheduleDayEntry, isRestDay, projectToSessionFields } from '../services/workout-projection';

const router = Router();

// ─── Helpers ────────────────────────────────────────────────

/**
 * Check if user has EDIT access to a horse (admin always passes).
 * Returns true if access granted, sends 403 response and returns false otherwise.
 */
async function checkHorseEditAccess(req: AuthRequest, res: Response, horseId: string): Promise<boolean> {
  if (req.user!.role === 'ADMIN') return true;

  const assignment = await prisma.horseAssignment.findUnique({
    where: { userId_horseId: { userId: req.user!.userId, horseId } },
  });
  if (!assignment || assignment.permission !== 'EDIT') {
    res.status(403).json({ error: 'Edit access required for this horse' });
    return false;
  }
  return true;
}

// ─── Schemas ────────────────────────────────────────────────

const applyPlanSchema = z.object({
  horseId: z.string().uuid(),
  programmeVersionId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
});

// ─── POST /api/applied-plans ────────────────────────────────

router.post('/', authenticate, requireRole('ADMIN', 'TRAINER'), async (req: AuthRequest, res: Response) => {
  try {
    const data = applyPlanSchema.parse(req.body);

    // Verify horse exists
    const horse = await prisma.horse.findUnique({
      where: { id: data.horseId },
      select: { id: true, name: true },
    });
    if (!horse) {
      res.status(404).json({ error: 'Horse not found' });
      return;
    }

    // Check EDIT access
    if (!(await checkHorseEditAccess(req, res, data.horseId))) return;

    // Load programme version (must be PUBLISHED)
    const programmeVersion = await prisma.programmeVersion.findUnique({
      where: { id: data.programmeVersionId },
      include: { programme: { select: { id: true, name: true } } },
    });
    if (!programmeVersion) {
      res.status(404).json({ error: 'Programme version not found' });
      return;
    }
    if (programmeVersion.status !== 'PUBLISHED') {
      res.status(400).json({ error: 'Can only apply a PUBLISHED programme version' });
      return;
    }

    // Parse and validate startDate
    const startDate = new Date(data.startDate + 'T00:00:00Z');
    if (isNaN(startDate.getTime())) {
      res.status(400).json({ error: 'Invalid startDate' });
      return;
    }

    // Extract schedule entries from version
    const scheduleData = programmeVersion.scheduleData as unknown as ScheduleDayEntry[];
    if (!Array.isArray(scheduleData) || scheduleData.length === 0) {
      res.status(400).json({ error: 'Programme version has no schedule data' });
      return;
    }

    const numWeeks = programmeVersion.numWeeks;
    const programmeName = programmeVersion.programme.name;

    // Check for PlannedSession collisions before starting the transaction.
    // All workouts default to AM slot.
    const scheduledDates: Date[] = [];
    for (const entry of scheduleData) {
      const offsetDays = (entry.week - 1) * 7 + (entry.day - 1);
      const d = new Date(startDate);
      d.setUTCDate(d.getUTCDate() + offsetDays);
      scheduledDates.push(d);
    }

    const existingSessions = await prisma.plannedSession.findMany({
      where: {
        horseId: data.horseId,
        slot: 'AM',
        date: { in: scheduledDates },
      },
      select: { date: true },
    });

    if (existingSessions.length > 0) {
      const conflictDates = existingSessions.map(s =>
        s.date.toISOString().split('T')[0]
      );
      res.status(409).json({
        error: `Cannot apply: ${existingSessions.length} date(s) already have AM planned sessions`,
        conflictDates,
      });
      return;
    }

    // Execute everything in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create AppliedPlan
      const appliedPlan = await tx.appliedPlan.create({
        data: {
          horseId: data.horseId,
          programmeVersionId: data.programmeVersionId,
          assignedById: req.user!.userId,
          startDate,
          status: 'ACTIVE',
        },
      });

      // 2. Create PlanBlock (for Planner grid compatibility)
      const planBlock = await tx.planBlock.create({
        data: {
          horseId: data.horseId,
          programmeId: programmeVersion.programmeId,
          appliedPlanId: appliedPlan.id,
          name: `${programmeName} v${programmeVersion.version}`,
          startDate,
          numWeeks,
        },
      });

      // 3. Create Workout + PlannedSession for each schedule day
      let workoutsCreated = 0;

      for (const entry of scheduleData) {
        const offsetDays = (entry.week - 1) * 7 + (entry.day - 1);
        const scheduledDate = new Date(startDate);
        scheduledDate.setUTCDate(scheduledDate.getUTCDate() + offsetDays);

        const rest = isRestDay(entry);
        const entryJson = entry as unknown as Prisma.InputJsonValue;

        // Create Workout
        const workout = await tx.workout.create({
          data: {
            appliedPlanId: appliedPlan.id,
            horseId: data.horseId,
            originWeek: entry.week,
            originDay: entry.day,
            scheduledDate,
            slot: 'AM',
            baselineData: entryJson,
            currentData: entryJson,
            isRest: rest,
          },
        });

        // Create PlannedSession projection
        const sessionFields = projectToSessionFields(entry);
        await tx.plannedSession.create({
          data: {
            planBlockId: planBlock.id,
            horseId: data.horseId,
            workoutId: workout.id,
            date: scheduledDate,
            slot: 'AM',
            ...sessionFields,
          },
        });

        workoutsCreated++;
      }

      return { appliedPlan, planBlock, workoutsCreated };
    });

    res.status(201).json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Apply programme error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/applied-plans?horseId= ────────────────────────

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const horseId = req.query.horseId as string | undefined;

    if (!horseId) {
      res.status(400).json({ error: 'horseId query parameter required' });
      return;
    }

    // Check access to horse
    if (req.user!.role !== 'ADMIN') {
      const assignment = await prisma.horseAssignment.findUnique({
        where: { userId_horseId: { userId: req.user!.userId, horseId } },
      });
      if (!assignment) {
        res.status(403).json({ error: 'No access to this horse' });
        return;
      }
    }

    const plans = await prisma.appliedPlan.findMany({
      where: { horseId },
      include: {
        programmeVersion: {
          select: {
            id: true,
            version: true,
            numWeeks: true,
            programme: { select: { id: true, name: true } },
          },
        },
        assignedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(plans);
  } catch (err) {
    console.error('List applied plans error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/applied-plans/:id ─────────────────────────────

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const plan = await prisma.appliedPlan.findUnique({
      where: { id: req.params.id },
      include: {
        programmeVersion: {
          select: {
            id: true,
            version: true,
            numWeeks: true,
            manualFileName: true,
            programme: { select: { id: true, name: true } },
          },
        },
        assignedBy: { select: { id: true, name: true, email: true } },
        horse: { select: { id: true, name: true } },
      },
    });

    if (!plan) {
      res.status(404).json({ error: 'Applied plan not found' });
      return;
    }

    // Check access to horse
    if (req.user!.role !== 'ADMIN') {
      const assignment = await prisma.horseAssignment.findUnique({
        where: { userId_horseId: { userId: req.user!.userId, horseId: plan.horseId } },
      });
      if (!assignment) {
        res.status(403).json({ error: 'No access to this horse' });
        return;
      }
    }

    res.json(plan);
  } catch (err) {
    console.error('Get applied plan error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PATCH /api/applied-plans/:id/status ────────────────────

const statusSchema = z.object({
  status: z.enum(['COMPLETED', 'CANCELLED']),
});

router.patch('/:id/status', authenticate, requireRole('ADMIN', 'TRAINER'), async (req: AuthRequest, res: Response) => {
  try {
    const data = statusSchema.parse(req.body);

    const plan = await prisma.appliedPlan.findUnique({
      where: { id: req.params.id },
      select: { id: true, horseId: true, assignedById: true, status: true },
    });

    if (!plan) {
      res.status(404).json({ error: 'Applied plan not found' });
      return;
    }

    // Only the assigning trainer or admin can change status
    if (req.user!.role !== 'ADMIN' && plan.assignedById !== req.user!.userId) {
      res.status(403).json({ error: 'Only the assigning trainer can change plan status' });
      return;
    }

    if (plan.status !== 'ACTIVE') {
      res.status(400).json({ error: `Cannot change status of a ${plan.status} plan` });
      return;
    }

    const updated = await prisma.appliedPlan.update({
      where: { id: req.params.id },
      data: { status: data.status },
    });

    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Update applied plan status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
