import { Router, Response } from 'express';
import { prisma } from '../db';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

// GET /api/search?q=term
// Returns horses and programmes matching the query, scoped to the user's access.
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const q = ((req.query.q as string) ?? '').trim();

    if (q.length < 1) {
      res.json({ horses: [], programmes: [] });
      return;
    }

    const { userId, role } = req.user!;

    // ── Horses ───────────────────────────────────────────────
    // Admins see all horses; others see only assigned ones.
    let horses;
    if (role === 'ADMIN') {
      horses = await prisma.horse.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { breed: { contains: q, mode: 'insensitive' } },
            { stableLocation: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, breed: true, stableLocation: true, photoUrl: true },
        orderBy: { name: 'asc' },
        take: 8,
      });
    } else {
      const assignments = await prisma.horseAssignment.findMany({
        where: { userId },
        select: { horseId: true },
      });
      const horseIds = assignments.map((a) => a.horseId);

      horses = await prisma.horse.findMany({
        where: {
          id: { in: horseIds },
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { breed: { contains: q, mode: 'insensitive' } },
            { stableLocation: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, breed: true, stableLocation: true, photoUrl: true },
        orderBy: { name: 'asc' },
        take: 8,
      });
    }

    // ── Programmes ───────────────────────────────────────────
    // Trainers/Admins see all; Riders/Owners see published only.
    const programmeWhere =
      role === 'ADMIN' || role === 'TRAINER'
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { description: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {
            status: 'PUBLISHED' as const,
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { description: { contains: q, mode: 'insensitive' as const } },
            ],
          };

    const programmes = await prisma.programme.findMany({
      where: programmeWhere,
      select: { id: true, name: true, description: true, status: true },
      orderBy: { name: 'asc' },
      take: 6,
    });

    res.json({ horses, programmes });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
