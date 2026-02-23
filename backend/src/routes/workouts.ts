import { Router, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ScheduleDayEntry, isRestDay, projectToSessionFields, makeRestEntry } from '../services/workout-projection';

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

// ─── POST /api/workouts/:id/reschedule ──────────────────────

const rescheduleSchema = z.object({
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'targetDate must be YYYY-MM-DD'),
  slot: z.enum(['AM', 'PM']).optional(),
});

router.post('/:id/reschedule', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const body = rescheduleSchema.parse(req.body);
    const targetDate = new Date(body.targetDate + 'T00:00:00Z');
    if (isNaN(targetDate.getTime())) {
      res.status(400).json({ error: 'Invalid targetDate' });
      return;
    }
    const targetSlot = body.slot ?? 'AM';

    // Load the source workout with plan metadata
    const sourceWorkout = await prisma.workout.findUnique({
      where: { id: req.params.id },
      include: {
        appliedPlan: {
          select: { id: true, status: true, assignedById: true },
        },
        plannedSessions: { select: { id: true, planBlockId: true } },
      },
    });

    if (!sourceWorkout) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }

    if (sourceWorkout.appliedPlan.status !== 'ACTIVE') {
      res.status(400).json({ error: `Cannot reschedule workouts on a ${sourceWorkout.appliedPlan.status} plan` });
      return;
    }

    if (!sourceWorkout.scheduledDate) {
      res.status(400).json({ error: 'Cannot reschedule an unscheduled workout' });
      return;
    }

    // Check EDIT access
    const hasAccess = await checkWorkoutEditAccess(
      req.user!.userId,
      req.user!.role,
      sourceWorkout.horseId,
      sourceWorkout.appliedPlanId,
      sourceWorkout.appliedPlan.assignedById,
    );
    if (!hasAccess) {
      res.status(403).json({ error: 'Edit access required for this workout' });
      return;
    }

    // No-op if already at the target
    const sourceDate = sourceWorkout.scheduledDate;
    if (
      sourceDate.getTime() === targetDate.getTime() &&
      sourceWorkout.slot === targetSlot
    ) {
      res.json({ source: sourceWorkout, swapped: null });
      return;
    }

    // Check if there is a workout at the target date+slot for the same horse
    const targetWorkout = await prisma.workout.findFirst({
      where: {
        horseId: sourceWorkout.horseId,
        scheduledDate: targetDate,
        slot: targetSlot,
      },
      include: {
        plannedSessions: { select: { id: true, planBlockId: true } },
      },
    });

    const sourcePlanBlockId = sourceWorkout.plannedSessions[0]?.planBlockId;

    const result = await prisma.$transaction(async (tx) => {
      if (targetWorkout) {
        // ── SWAP: exchange dates/slots between the two workouts ──
        // To avoid PlannedSession unique constraint [horseId, date, slot]
        // violations, delete both PlannedSessions first, update workouts,
        // then recreate them.

        const targetPlanBlockId = targetWorkout.plannedSessions[0]?.planBlockId;

        // 1. Delete PlannedSessions for both workouts
        await tx.plannedSession.deleteMany({
          where: { workoutId: { in: [sourceWorkout.id, targetWorkout.id] } },
        });

        // 2. Swap dates/slots on Workout rows
        const updatedSource = await tx.workout.update({
          where: { id: sourceWorkout.id },
          data: { scheduledDate: targetDate, slot: targetSlot },
        });

        const updatedTarget = await tx.workout.update({
          where: { id: targetWorkout.id },
          data: { scheduledDate: sourceDate, slot: sourceWorkout.slot },
        });

        // 3. Recreate PlannedSessions at the new positions
        const sourceData = updatedSource.currentData as unknown as ScheduleDayEntry;
        const targetData = updatedTarget.currentData as unknown as ScheduleDayEntry;

        if (sourcePlanBlockId) {
          await tx.plannedSession.create({
            data: {
              planBlockId: sourcePlanBlockId,
              horseId: sourceWorkout.horseId,
              workoutId: updatedSource.id,
              date: targetDate,
              slot: targetSlot,
              ...projectToSessionFields(sourceData),
            },
          });
        }

        if (targetPlanBlockId) {
          await tx.plannedSession.create({
            data: {
              planBlockId: targetPlanBlockId,
              horseId: sourceWorkout.horseId,
              workoutId: updatedTarget.id,
              date: sourceDate,
              slot: sourceWorkout.slot,
              ...projectToSessionFields(targetData),
            },
          });
        }

        return { source: updatedSource, swapped: updatedTarget };
      } else {
        // ── MOVE: target slot is empty ──

        // 1. Delete source PlannedSession first (frees up old unique slot)
        await tx.plannedSession.deleteMany({
          where: { workoutId: sourceWorkout.id },
        });

        // 2. Move the source workout to the new date/slot
        const updatedSource = await tx.workout.update({
          where: { id: sourceWorkout.id },
          data: { scheduledDate: targetDate, slot: targetSlot },
        });

        // 3. Create PlannedSession at the new position
        const sourceData = updatedSource.currentData as unknown as ScheduleDayEntry;
        if (sourcePlanBlockId) {
          await tx.plannedSession.create({
            data: {
              planBlockId: sourcePlanBlockId,
              horseId: sourceWorkout.horseId,
              workoutId: updatedSource.id,
              date: targetDate,
              slot: targetSlot,
              ...projectToSessionFields(sourceData),
            },
          });
        }

        // 4. Check if old date is now empty for this applied plan → insert rest
        const remainingOnOldDate = await tx.workout.findFirst({
          where: {
            appliedPlanId: sourceWorkout.appliedPlanId,
            scheduledDate: sourceDate,
          },
        });

        let restWorkout = null;
        if (!remainingOnOldDate) {
          // Create a rest workout to fill the vacated date
          const restEntry = makeRestEntry(sourceWorkout.originWeek, sourceWorkout.originDay);
          const restJson = restEntry as unknown as Prisma.InputJsonValue;

          restWorkout = await tx.workout.create({
            data: {
              appliedPlanId: sourceWorkout.appliedPlanId,
              horseId: sourceWorkout.horseId,
              originWeek: sourceWorkout.originWeek,
              originDay: sourceWorkout.originDay,
              scheduledDate: sourceDate,
              slot: sourceWorkout.slot,
              baselineData: restJson,
              currentData: restJson,
              isRest: true,
            },
          });

          if (sourcePlanBlockId) {
            await tx.plannedSession.create({
              data: {
                planBlockId: sourcePlanBlockId,
                horseId: sourceWorkout.horseId,
                workoutId: restWorkout.id,
                date: sourceDate,
                slot: sourceWorkout.slot,
                ...projectToSessionFields(restEntry),
              },
            });
          }
        }

        return { source: updatedSource, swapped: null, rest: restWorkout };
      }
    });

    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Reschedule workout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
