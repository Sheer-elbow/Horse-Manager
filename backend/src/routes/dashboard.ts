import { Router, Response } from 'express';
import { prisma } from '../db';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

// GET /api/dashboard
// Returns: today's planned workouts (with logged status), upcoming vaccination alerts, recent session activity
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, role } = req.user!;

    // Build today's date range in UTC
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayEnd = new Date(todayStart);
    todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

    // 30-day lookahead for vaccination alerts
    const thirtyDaysOut = new Date(todayStart);
    thirtyDaysOut.setUTCDate(thirtyDaysOut.getUTCDate() + 30);

    // Resolve accessible horse IDs
    let horseIds: string[];
    if (role === 'ADMIN') {
      const all = await prisma.horse.findMany({ select: { id: true } });
      horseIds = all.map((h) => h.id);
    } else {
      const assignments = await prisma.horseAssignment.findMany({
        where: { userId },
        select: { horseId: true },
      });
      horseIds = assignments.map((a) => a.horseId);
    }

    if (horseIds.length === 0) {
      res.json({ todayWorkouts: [], upcomingVaccinations: [], recentSessions: [] });
      return;
    }

    // Today's non-rest workouts on active plans
    const todayWorkouts = await prisma.workout.findMany({
      where: {
        horseId: { in: horseIds },
        scheduledDate: { gte: todayStart, lt: todayEnd },
        isRest: false,
        appliedPlan: { status: 'ACTIVE' },
      },
      include: {
        horse: { select: { id: true, name: true, photoUrl: true } },
        appliedPlan: {
          select: {
            id: true,
            programmeVersion: {
              select: { programme: { select: { id: true, name: true } } },
            },
          },
        },
      },
      orderBy: [{ horse: { name: 'asc' } }, { slot: 'asc' }],
    });

    // Find which today workouts already have a logged session
    const todayLogs = await prisma.actualSessionLog.findMany({
      where: {
        horseId: { in: horseIds },
        date: { gte: todayStart, lt: todayEnd },
      },
      select: { horseId: true, slot: true },
    });

    const loggedSet = new Set(todayLogs.map((l) => `${l.horseId}:${l.slot}`));

    const todayWorkoutsWithStatus = todayWorkouts.map((w) => ({
      id: w.id,
      horseId: w.horseId,
      horse: w.horse,
      slot: w.slot,
      programmeName: w.appliedPlan?.programmeVersion?.programme?.name ?? null,
      appliedPlanId: w.appliedPlan?.id ?? null,
      currentData: w.currentData,
      logged: loggedSet.has(`${w.horseId}:${w.slot}`),
    }));

    // Vaccination alerts: due within 30 days (including overdue)
    const upcomingVaccinations = await prisma.vaccinationRecord.findMany({
      where: {
        horseId: { in: horseIds },
        dueDate: { not: null, lte: thirtyDaysOut },
      },
      include: {
        horse: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    // Recent session activity across accessible horses
    const recentSessions = await prisma.actualSessionLog.findMany({
      where: { horseId: { in: horseIds } },
      include: {
        horse: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { date: 'desc' },
      take: 8,
    });

    res.json({
      todayWorkouts: todayWorkoutsWithStatus,
      upcomingVaccinations: upcomingVaccinations.map((v) => ({
        id: v.id,
        horseId: v.horseId,
        horse: v.horse,
        name: v.name,
        dueDate: v.dueDate,
        overdue: v.dueDate ? v.dueDate < todayStart : false,
      })),
      recentSessions: recentSessions.map((s) => ({
        id: s.id,
        horseId: s.horseId,
        horse: s.horse,
        date: s.date,
        slot: s.slot,
        sessionType: s.sessionType,
        durationMinutes: s.durationMinutes,
        createdBy: s.createdBy,
      })),
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
