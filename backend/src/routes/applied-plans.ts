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

/**
 * Check if user can VIEW an applied plan.
 * Access granted if:
 *   - user is ADMIN, OR
 *   - user is the trainer who assigned the plan, OR
 *   - user has a HorseAssignment for the plan's horse, OR
 *   - user has a PlanShare for this plan
 */
async function canViewPlan(userId: string, role: string, planId: string, horseId: string, assignedById: string): Promise<boolean> {
  if (role === 'ADMIN') return true;
  if (userId === assignedById) return true;

  const assignment = await prisma.horseAssignment.findUnique({
    where: { userId_horseId: { userId, horseId } },
  });
  if (assignment) return true;

  const share = await prisma.planShare.findFirst({
    where: { appliedPlanId: planId, sharedWithId: userId },
  });
  return !!share;
}

// ─── Core apply logic ────────────────────────────────────────

interface ApplyParams {
  horseId: string;
  programmeVersionId: string;
  programmeId: string;
  programmeName: string;
  versionNumber: number;
  numWeeks: number;
  scheduleData: ScheduleDayEntry[];
  startDate: Date;
  assignedById: string;
  sourceAppliedPlanId?: string;
  isAmended?: boolean;
}

/**
 * Shared transaction logic for applying a programme version to a horse.
 * Used by both POST /applied-plans and POST /applied-plans/:id/repeat.
 * Returns collision error string or null (caller should 409 if non-null).
 */
async function checkCollisions(horseId: string, scheduleData: ScheduleDayEntry[], startDate: Date) {
  const scheduledDates: Date[] = [];
  for (const entry of scheduleData) {
    const offsetDays = (entry.week - 1) * 7 + (entry.day - 1);
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + offsetDays);
    scheduledDates.push(d);
  }

  const existingSessions = await prisma.plannedSession.findMany({
    where: { horseId, slot: 'AM', date: { in: scheduledDates } },
    select: { date: true },
  });

  if (existingSessions.length > 0) {
    return existingSessions.map(s => s.date.toISOString().split('T')[0]);
  }
  return null;
}

async function executeApply(params: ApplyParams) {
  return prisma.$transaction(async (tx) => {
    // 1. Create AppliedPlan
    const appliedPlan = await tx.appliedPlan.create({
      data: {
        horseId: params.horseId,
        programmeVersionId: params.programmeVersionId,
        assignedById: params.assignedById,
        startDate: params.startDate,
        status: 'ACTIVE',
        sourceAppliedPlanId: params.sourceAppliedPlanId ?? null,
        isAmended: params.isAmended ?? false,
      },
    });

    // 2. Create PlanBlock (for Planner grid compatibility)
    const planBlock = await tx.planBlock.create({
      data: {
        horseId: params.horseId,
        programmeId: params.programmeId,
        appliedPlanId: appliedPlan.id,
        name: `${params.programmeName} v${params.versionNumber}`,
        startDate: params.startDate,
        numWeeks: params.numWeeks,
      },
    });

    // 3. Create Workout + PlannedSession for each schedule day
    let workoutsCreated = 0;

    for (const entry of params.scheduleData) {
      const offsetDays = (entry.week - 1) * 7 + (entry.day - 1);
      const scheduledDate = new Date(params.startDate);
      scheduledDate.setUTCDate(scheduledDate.getUTCDate() + offsetDays);

      const rest = isRestDay(entry);
      const entryJson = entry as unknown as Prisma.InputJsonValue;

      const workout = await tx.workout.create({
        data: {
          appliedPlanId: appliedPlan.id,
          horseId: params.horseId,
          originWeek: entry.week,
          originDay: entry.day,
          scheduledDate,
          slot: 'AM',
          baselineData: entryJson,
          currentData: entryJson,
          isRest: rest,
        },
      });

      const sessionFields = projectToSessionFields(entry);
      await tx.plannedSession.create({
        data: {
          planBlockId: planBlock.id,
          horseId: params.horseId,
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

    // Check for PlannedSession collisions
    const conflictDates = await checkCollisions(data.horseId, scheduleData, startDate);
    if (conflictDates) {
      res.status(409).json({
        error: `Cannot apply: ${conflictDates.length} date(s) already have AM planned sessions`,
        conflictDates,
      });
      return;
    }

    const result = await executeApply({
      horseId: data.horseId,
      programmeVersionId: data.programmeVersionId,
      programmeId: programmeVersion.programmeId,
      programmeName: programmeVersion.programme.name,
      versionNumber: programmeVersion.version,
      numWeeks: programmeVersion.numWeeks,
      scheduleData,
      startDate,
      assignedById: req.user!.userId,
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

// ─── GET /api/applied-plans?horseId=&status= ────────────────
// Visibility:
//   - ADMIN sees all plans for the horse
//   - Trainer sees plans they assigned + plans shared with them
//   - Rider/Owner sees plans for horses they have a HorseAssignment for
// Optional filters:
//   - status: ACTIVE | COMPLETED | CANCELLED (omit for all)

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const horseId = req.query.horseId as string | undefined;
    const statusFilter = req.query.status as string | undefined;

    if (!horseId) {
      res.status(400).json({ error: 'horseId query parameter required' });
      return;
    }

    if (statusFilter && !['ACTIVE', 'COMPLETED', 'CANCELLED'].includes(statusFilter)) {
      res.status(400).json({ error: 'status must be ACTIVE, COMPLETED, or CANCELLED' });
      return;
    }

    const userId = req.user!.userId;
    const role = req.user!.role;

    // Build visibility filter
    let where: Record<string, unknown>;

    if (role === 'ADMIN') {
      where = { horseId };
    } else {
      // Check if user has a HorseAssignment (riders/owners see all plans on their horse)
      const assignment = await prisma.horseAssignment.findUnique({
        where: { userId_horseId: { userId, horseId } },
      });

      if (assignment) {
        // Horse assignment grants visibility to all plans on this horse
        where = { horseId };
      } else {
        // No horse assignment — only see plans they assigned or that are shared with them
        where = {
          horseId,
          OR: [
            { assignedById: userId },
            { shares: { some: { sharedWithId: userId } } },
          ],
        };
      }
    }

    if (statusFilter) {
      where.status = statusFilter;
    }

    const plans = await prisma.appliedPlan.findMany({
      where,
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
        _count: { select: { workouts: true } },
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

    // Check visibility
    if (!(await canViewPlan(req.user!.userId, req.user!.role, plan.id, plan.horseId, plan.assignedById))) {
      res.status(403).json({ error: 'No access to this plan' });
      return;
    }

    // Compute workout summary: counts + date range
    const [workoutAgg, dateRange] = await Promise.all([
      prisma.workout.groupBy({
        by: ['isRest'],
        where: { appliedPlanId: plan.id },
        _count: { id: true },
      }),
      prisma.workout.aggregate({
        where: { appliedPlanId: plan.id, scheduledDate: { not: null } },
        _min: { scheduledDate: true },
        _max: { scheduledDate: true },
      }),
    ]);

    const totalWorkouts = workoutAgg.reduce((sum, g) => sum + g._count.id, 0);
    const restDays = workoutAgg.find(g => g.isRest)?._count.id ?? 0;
    const trainingDays = totalWorkouts - restDays;

    res.json({
      ...plan,
      workoutSummary: {
        total: totalWorkouts,
        trainingDays,
        restDays,
        earliestDate: dateRange._min.scheduledDate,
        latestDate: dateRange._max.scheduledDate,
      },
    });
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

// ─── POST /api/applied-plans/:id/repeat ──────────────────────

const repeatSchema = z.object({
  mode: z.enum(['original', 'amended']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
});

router.post('/:id/repeat', authenticate, requireRole('ADMIN', 'TRAINER'), async (req: AuthRequest, res: Response) => {
  try {
    const body = repeatSchema.parse(req.body);

    // Load the source applied plan
    const sourcePlan = await prisma.appliedPlan.findUnique({
      where: { id: req.params.id },
      include: {
        programmeVersion: {
          include: { programme: { select: { id: true, name: true } } },
        },
      },
    });

    if (!sourcePlan) {
      res.status(404).json({ error: 'Applied plan not found' });
      return;
    }

    // Check EDIT access on the horse
    if (!(await checkHorseEditAccess(req, res, sourcePlan.horseId))) return;

    // Parse startDate
    const startDate = new Date(body.startDate + 'T00:00:00Z');
    if (isNaN(startDate.getTime())) {
      res.status(400).json({ error: 'Invalid startDate' });
      return;
    }

    const pv = sourcePlan.programmeVersion;
    const programmeName = pv.programme.name;

    if (body.mode === 'original') {
      // ── ORIGINAL: reuse the same published version's scheduleData ──
      const scheduleData = pv.scheduleData as unknown as ScheduleDayEntry[];
      if (!Array.isArray(scheduleData) || scheduleData.length === 0) {
        res.status(400).json({ error: 'Source programme version has no schedule data' });
        return;
      }

      const conflictDates = await checkCollisions(sourcePlan.horseId, scheduleData, startDate);
      if (conflictDates) {
        res.status(409).json({
          error: `Cannot repeat: ${conflictDates.length} date(s) already have AM planned sessions`,
          conflictDates,
        });
        return;
      }

      const result = await executeApply({
        horseId: sourcePlan.horseId,
        programmeVersionId: pv.id,
        programmeId: pv.programmeId,
        programmeName,
        versionNumber: pv.version,
        numWeeks: pv.numWeeks,
        scheduleData,
        startDate,
        assignedById: req.user!.userId,
        sourceAppliedPlanId: sourcePlan.id,
      });

      res.status(201).json(result);
    } else {
      // ── AMENDED: derive scheduleData from the source plan's workouts ──
      const workouts = await prisma.workout.findMany({
        where: { appliedPlanId: sourcePlan.id },
        orderBy: [{ originWeek: 'asc' }, { originDay: 'asc' }],
      });

      if (workouts.length === 0) {
        res.status(400).json({ error: 'Source plan has no workouts to derive from' });
        return;
      }

      // Build amended scheduleData from currentData of each workout
      const amendedSchedule: ScheduleDayEntry[] = workouts.map(w => {
        const data = w.currentData as unknown as ScheduleDayEntry;
        return {
          ...data,
          week: w.originWeek,
          day: w.originDay,
        };
      });

      // Compute numWeeks from the max originWeek
      const numWeeks = Math.max(...workouts.map(w => w.originWeek));

      const conflictDates = await checkCollisions(sourcePlan.horseId, amendedSchedule, startDate);
      if (conflictDates) {
        res.status(409).json({
          error: `Cannot repeat: ${conflictDates.length} date(s) already have AM planned sessions`,
          conflictDates,
        });
        return;
      }

      // Create a private amended ProgrammeVersion (PUBLISHED so it can be applied),
      // then apply it — all in one transaction
      const result = await prisma.$transaction(async (tx) => {
        // Find the next version number for this programme
        const latestVersion = await tx.programmeVersion.findFirst({
          where: { programmeId: pv.programmeId },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const nextVersion = (latestVersion?.version ?? 0) + 1;

        // Create the amended version (immediately PUBLISHED)
        const amendedVersion = await tx.programmeVersion.create({
          data: {
            programmeId: pv.programmeId,
            version: nextVersion,
            status: 'PUBLISHED',
            numWeeks,
            manualHtml: pv.manualHtml,
            manualFileName: pv.manualFileName,
            scheduleData: amendedSchedule as unknown as Prisma.InputJsonValue,
            publishedAt: new Date(),
          },
        });

        // Create AppliedPlan
        const appliedPlan = await tx.appliedPlan.create({
          data: {
            horseId: sourcePlan.horseId,
            programmeVersionId: amendedVersion.id,
            assignedById: req.user!.userId,
            startDate,
            status: 'ACTIVE',
            sourceAppliedPlanId: sourcePlan.id,
            isAmended: true,
          },
        });

        // Create PlanBlock
        const planBlock = await tx.planBlock.create({
          data: {
            horseId: sourcePlan.horseId,
            programmeId: pv.programmeId,
            appliedPlanId: appliedPlan.id,
            name: `${programmeName} v${nextVersion} (amended)`,
            startDate,
            numWeeks,
          },
        });

        // Create Workouts + PlannedSessions
        let workoutsCreated = 0;
        for (const entry of amendedSchedule) {
          const offsetDays = (entry.week - 1) * 7 + (entry.day - 1);
          const scheduledDate = new Date(startDate);
          scheduledDate.setUTCDate(scheduledDate.getUTCDate() + offsetDays);

          const rest = isRestDay(entry);
          const entryJson = entry as unknown as Prisma.InputJsonValue;

          const workout = await tx.workout.create({
            data: {
              appliedPlanId: appliedPlan.id,
              horseId: sourcePlan.horseId,
              originWeek: entry.week,
              originDay: entry.day,
              scheduledDate,
              slot: 'AM',
              baselineData: entryJson,
              currentData: entryJson,
              isRest: rest,
            },
          });

          const sessionFields = projectToSessionFields(entry);
          await tx.plannedSession.create({
            data: {
              planBlockId: planBlock.id,
              horseId: sourcePlan.horseId,
              workoutId: workout.id,
              date: scheduledDate,
              slot: 'AM',
              ...sessionFields,
            },
          });

          workoutsCreated++;
        }

        return { appliedPlan, planBlock, workoutsCreated, amendedVersion: { id: amendedVersion.id, version: amendedVersion.version } };
      });

      res.status(201).json(result);
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Repeat applied plan error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /api/applied-plans/:id ───────────────────────────
// Remove an applied programme from a horse.
// Deletes: PlanBlocks → PlannedSessions, Workouts, PlanShares.
// Preserves: ActualSessionLogs (plannedSessionId set to null).

router.delete('/:id', authenticate, requireRole('ADMIN', 'TRAINER'), async (req: AuthRequest, res: Response) => {
  try {
    const plan = await prisma.appliedPlan.findUnique({
      where: { id: req.params.id },
      select: { id: true, horseId: true, assignedById: true },
    });

    if (!plan) {
      res.status(404).json({ error: 'Applied plan not found' });
      return;
    }

    // Only the assigning trainer or admin can remove
    if (req.user!.role !== 'ADMIN' && plan.assignedById !== req.user!.userId) {
      res.status(403).json({ error: 'Only the assigning trainer can remove this plan' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      // 1. Delete PlanBlocks (cascades to PlannedSessions; ActualSessionLogs.plannedSessionId → null)
      await tx.planBlock.deleteMany({ where: { appliedPlanId: plan.id } });

      // 2. Delete AppliedPlan (cascades to Workouts and PlanShares)
      await tx.appliedPlan.delete({ where: { id: plan.id } });
    });

    res.json({ message: 'Applied plan removed. Actual session logs have been preserved.' });
  } catch (err) {
    console.error('Delete applied plan error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/applied-plans/:id/shares ──────────────────────

const createShareSchema = z.object({
  userId: z.string().uuid(),
  permission: z.enum(['VIEW', 'EDIT']),
});

router.post('/:id/shares', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = createShareSchema.parse(req.body);

    const plan = await prisma.appliedPlan.findUnique({
      where: { id: req.params.id },
      select: { id: true, horseId: true, assignedById: true },
    });

    if (!plan) {
      res.status(404).json({ error: 'Applied plan not found' });
      return;
    }

    // Only the assigning trainer or admin can share
    if (req.user!.role !== 'ADMIN' && plan.assignedById !== req.user!.userId) {
      res.status(403).json({ error: 'Only the assigning trainer can share this plan' });
      return;
    }

    // Cannot share with yourself
    if (data.userId === plan.assignedById) {
      res.status(400).json({ error: 'Cannot share a plan with its assigning trainer' });
      return;
    }

    // Verify target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, name: true, email: true },
    });
    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Upsert: update permission if share already exists
    const share = await prisma.planShare.upsert({
      where: {
        appliedPlanId_sharedWithId: {
          appliedPlanId: plan.id,
          sharedWithId: data.userId,
        },
      },
      update: { permission: data.permission },
      create: {
        appliedPlanId: plan.id,
        sharedWithId: data.userId,
        permission: data.permission,
      },
      include: {
        sharedWith: { select: { id: true, name: true, email: true } },
      },
    });

    res.status(201).json(share);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Create plan share error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/applied-plans/:id/shares ───────────────────────

router.get('/:id/shares', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const plan = await prisma.appliedPlan.findUnique({
      where: { id: req.params.id },
      select: { id: true, horseId: true, assignedById: true },
    });

    if (!plan) {
      res.status(404).json({ error: 'Applied plan not found' });
      return;
    }

    // Check visibility (anyone who can view the plan can see its shares)
    if (!(await canViewPlan(req.user!.userId, req.user!.role, plan.id, plan.horseId, plan.assignedById))) {
      res.status(403).json({ error: 'No access to this plan' });
      return;
    }

    const shares = await prisma.planShare.findMany({
      where: { appliedPlanId: plan.id },
      include: {
        sharedWith: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json(shares);
  } catch (err) {
    console.error('List plan shares error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /api/applied-plans/:id/shares/:shareId ───────────

router.delete('/:id/shares/:shareId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const share = await prisma.planShare.findUnique({
      where: { id: req.params.shareId },
      include: {
        appliedPlan: { select: { id: true, assignedById: true } },
      },
    });

    if (!share) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }

    // Verify share belongs to this plan
    if (share.appliedPlanId !== req.params.id) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }

    // Only the assigning trainer, admin, or the shared user themselves can delete
    const isAdmin = req.user!.role === 'ADMIN';
    const isAssigner = share.appliedPlan.assignedById === req.user!.userId;
    const isSelf = share.sharedWithId === req.user!.userId;

    if (!isAdmin && !isAssigner && !isSelf) {
      res.status(403).json({ error: 'Only the assigning trainer or the shared user can remove a share' });
      return;
    }

    await prisma.planShare.delete({ where: { id: share.id } });

    res.status(204).end();
  } catch (err) {
    console.error('Delete plan share error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
