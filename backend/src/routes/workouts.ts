import { Router, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ScheduleDayEntry, isRestDay, projectToSessionFields } from '../services/workout-projection';

const router = Router();

// ─── Helpers ────────────────────────────────────────────────

/**
 * Check if user has at least VIEW access to a horse.
 * Access granted if:
 *   - user is ADMIN, OR
 *   - user has a HorseAssignment for the horse, OR
 *   - user has a PlanShare for any applied plan on the horse
 */
async function checkHorseViewAccess(userId: string, role: string, horseId: string): Promise<boolean> {
  if (role === 'ADMIN') return true;

  const assignment = await prisma.horseAssignment.findUnique({
    where: { userId_horseId: { userId, horseId } },
  });
  if (assignment) return true;

  // Check if user has a PlanShare for any applied plan on this horse
  const share = await prisma.planShare.findFirst({
    where: {
      sharedWithId: userId,
      appliedPlan: { horseId },
    },
  });
  return !!share;
}

/**
 * Check if user has EDIT access to a workout.
 * Access granted if:
 *   - user is ADMIN, OR
 *   - user is the trainer who assigned the plan, OR
 *   - user has a HorseAssignment with EDIT permission, OR
 *   - user has a PlanShare with EDIT permission for the workout's applied plan
 */
async function checkWorkoutEditAccess(
  userId: string,
  role: string,
  horseId: string,
  appliedPlanId: string,
  assignedById: string,
): Promise<boolean> {
  if (role === 'ADMIN') return true;
  if (userId === assignedById) return true;

  const assignment = await prisma.horseAssignment.findUnique({
    where: { userId_horseId: { userId, horseId } },
  });
  if (assignment && assignment.permission === 'EDIT') return true;

  const share = await prisma.planShare.findUnique({
    where: { appliedPlanId_sharedWithId: { appliedPlanId, sharedWithId: userId } },
  });
  if (share && share.permission === 'EDIT') return true;

  return false;
}

// ─── Schemas ────────────────────────────────────────────────

const scheduleBlockSchema = z.object({
  name: z.string(),
  text: z.string(),
});

const updateCurrentDataSchema = z.object({
  title: z.string().optional(),
  category: z.string().optional(),
  durationMin: z.number().int().min(0).nullable().optional(),
  durationMax: z.number().int().min(0).nullable().optional(),
  intensityLabel: z.string().nullable().optional(),
  intensityRpeMin: z.number().int().min(1).max(10).nullable().optional(),
  intensityRpeMax: z.number().int().min(1).max(10).nullable().optional(),
  blocks: z.array(scheduleBlockSchema).optional(),
  substitution: z.string().nullable().optional(),
  manualRef: z.string().nullable().optional(),
});

// ─── GET /api/workouts?horseId=&weekStart=&weekEnd= ─────────

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const horseId = req.query.horseId as string | undefined;
    const weekStart = req.query.weekStart as string | undefined;
    const weekEnd = req.query.weekEnd as string | undefined;
    const appliedPlanId = req.query.appliedPlanId as string | undefined;

    if (!horseId) {
      res.status(400).json({ error: 'horseId query parameter required' });
      return;
    }

    // Access check
    if (!(await checkHorseViewAccess(req.user!.userId, req.user!.role, horseId))) {
      res.status(403).json({ error: 'No access to this horse' });
      return;
    }

    // Build where clause
    const where: Record<string, unknown> = {
      horseId,
      scheduledDate: { not: null }, // Only scheduled workouts (not unscheduled tray)
    };

    if (appliedPlanId) {
      where.appliedPlanId = appliedPlanId;
    }

    if (weekStart) {
      const start = new Date(weekStart + 'T00:00:00Z');
      const end = weekEnd
        ? new Date(weekEnd + 'T00:00:00Z')
        : new Date(start);
      if (!weekEnd) {
        end.setUTCDate(end.getUTCDate() + 7);
      }
      where.scheduledDate = { gte: start, lt: end };
    }

    const workouts = await prisma.workout.findMany({
      where,
      include: {
        appliedPlan: {
          select: {
            id: true,
            status: true,
            assignedById: true,
            programmeVersion: {
              select: {
                id: true,
                version: true,
                manualFileName: true,
                programme: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: [{ scheduledDate: 'asc' }, { slot: 'asc' }],
    });

    res.json(workouts);
  } catch (err) {
    console.error('List workouts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/workouts/unscheduled?appliedPlanId= ───────────

router.get('/unscheduled', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const appliedPlanId = req.query.appliedPlanId as string | undefined;

    if (!appliedPlanId) {
      res.status(400).json({ error: 'appliedPlanId query parameter required' });
      return;
    }

    // Load plan to get horseId for access check
    const plan = await prisma.appliedPlan.findUnique({
      where: { id: appliedPlanId },
      select: { horseId: true },
    });
    if (!plan) {
      res.status(404).json({ error: 'Applied plan not found' });
      return;
    }

    // Access check
    if (!(await checkHorseViewAccess(req.user!.userId, req.user!.role, plan.horseId))) {
      res.status(403).json({ error: 'No access to this horse' });
      return;
    }

    const workouts = await prisma.workout.findMany({
      where: {
        appliedPlanId,
        scheduledDate: null,
      },
      include: {
        appliedPlan: {
          select: {
            id: true,
            status: true,
            programmeVersion: {
              select: {
                id: true,
                version: true,
                programme: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: [{ originWeek: 'asc' }, { originDay: 'asc' }],
    });

    res.json(workouts);
  } catch (err) {
    console.error('List unscheduled workouts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/workouts/:id ──────────────────────────────────

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const workout = await prisma.workout.findUnique({
      where: { id: req.params.id },
      include: {
        appliedPlan: {
          select: {
            id: true,
            status: true,
            assignedById: true,
            programmeVersion: {
              select: {
                id: true,
                version: true,
                manualFileName: true,
                programme: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!workout) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }

    // Access check
    if (!(await checkHorseViewAccess(req.user!.userId, req.user!.role, workout.horseId))) {
      res.status(403).json({ error: 'No access to this horse' });
      return;
    }

    res.json(workout);
  } catch (err) {
    console.error('Get workout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /api/workouts/:id ──────────────────────────────────

router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const body = updateCurrentDataSchema.parse(req.body);

    // Load workout with plan metadata for permission check
    const workout = await prisma.workout.findUnique({
      where: { id: req.params.id },
      include: {
        appliedPlan: {
          select: { id: true, status: true, assignedById: true },
        },
      },
    });

    if (!workout) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }

    // Only ACTIVE plans can have workouts edited
    if (workout.appliedPlan.status !== 'ACTIVE') {
      res.status(400).json({ error: `Cannot edit workouts on a ${workout.appliedPlan.status} plan` });
      return;
    }

    // Check EDIT access
    const hasAccess = await checkWorkoutEditAccess(
      req.user!.userId,
      req.user!.role,
      workout.horseId,
      workout.appliedPlanId,
      workout.appliedPlan.assignedById,
    );
    if (!hasAccess) {
      res.status(403).json({ error: 'Edit access required for this workout' });
      return;
    }

    // Merge partial update into existing currentData
    const existingData = workout.currentData as unknown as ScheduleDayEntry;
    const merged: ScheduleDayEntry = {
      ...existingData,
      ...Object.fromEntries(
        Object.entries(body).filter(([, v]) => v !== undefined),
      ),
    };

    const rest = isRestDay(merged);
    const mergedJson = merged as unknown as Prisma.InputJsonValue;
    const sessionFields = projectToSessionFields(merged);

    // Update workout + linked PlannedSession(s) in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.workout.update({
        where: { id: req.params.id },
        data: {
          currentData: mergedJson,
          isRest: rest,
        },
      });

      // Sync all linked PlannedSessions
      await tx.plannedSession.updateMany({
        where: { workoutId: workout.id },
        data: sessionFields,
      });

      return updated;
    });

    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Update workout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/workouts/:id/reset ───────────────────────────

router.post('/:id/reset', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Load workout with plan metadata for permission check
    const workout = await prisma.workout.findUnique({
      where: { id: req.params.id },
      include: {
        appliedPlan: {
          select: { id: true, status: true, assignedById: true },
        },
      },
    });

    if (!workout) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }

    if (workout.appliedPlan.status !== 'ACTIVE') {
      res.status(400).json({ error: `Cannot reset workouts on a ${workout.appliedPlan.status} plan` });
      return;
    }

    // Check EDIT access
    const hasAccess = await checkWorkoutEditAccess(
      req.user!.userId,
      req.user!.role,
      workout.horseId,
      workout.appliedPlanId,
      workout.appliedPlan.assignedById,
    );
    if (!hasAccess) {
      res.status(403).json({ error: 'Edit access required for this workout' });
      return;
    }

    // Reset currentData back to baselineData
    const baseline = workout.baselineData as unknown as ScheduleDayEntry;
    const rest = isRestDay(baseline);
    const baselineJson = baseline as unknown as Prisma.InputJsonValue;
    const sessionFields = projectToSessionFields(baseline);

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.workout.update({
        where: { id: req.params.id },
        data: {
          currentData: baselineJson,
          isRest: rest,
        },
      });

      await tx.plannedSession.updateMany({
        where: { workoutId: workout.id },
        data: sessionFields,
      });

      return updated;
    });

    res.json(result);
  } catch (err) {
    console.error('Reset workout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
