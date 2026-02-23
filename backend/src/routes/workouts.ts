import { Router, Response } from 'express';
import { prisma } from '../db';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

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

export default router;
