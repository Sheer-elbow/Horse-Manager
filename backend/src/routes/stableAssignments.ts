import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router({ mergeParams: true });

// Only ADMIN or the STABLE_LEAD of this stable can manage assignments
async function requireStableManageAccess(req: AuthRequest, res: Response): Promise<boolean> {
  const { role, userId } = req.user!;
  if (role === 'ADMIN') return true;
  if (role === 'STABLE_LEAD') {
    const assignment = await prisma.stableAssignment.findUnique({
      where: { userId_stableId: { userId, stableId: req.params.stableId } },
    });
    if (assignment) return true;
  }
  res.status(403).json({ error: 'Stable Lead or Admin access required' });
  return false;
}

// GET /api/stables/:stableId/assignments
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  if (!await requireStableManageAccess(req, res)) return;
  try {
    const assignments = await prisma.stableAssignment.findMany({
      where: { stableId: req.params.stableId },
      include: { user: { select: { id: true, email: true, name: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(assignments);
  } catch (err) {
    console.error('List stable assignments error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const assignSchema = z.object({
  userId: z.string().uuid(),
});

// POST /api/stables/:stableId/assignments
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  if (!await requireStableManageAccess(req, res)) return;
  try {
    const { userId } = assignSchema.parse(req.body);
    const assignment = await prisma.stableAssignment.upsert({
      where: { userId_stableId: { userId, stableId: req.params.stableId } },
      create: { userId, stableId: req.params.stableId },
      update: {},
    });
    res.status(201).json(assignment);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Create stable assignment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/stables/:stableId/assignments/:assignmentId
router.delete('/:assignmentId', authenticate, async (req: AuthRequest, res: Response) => {
  if (!await requireStableManageAccess(req, res)) return;
  try {
    await prisma.stableAssignment.delete({ where: { id: req.params.assignmentId } });
    res.json({ message: 'Assignment removed' });
  } catch {
    res.status(404).json({ error: 'Assignment not found' });
  }
});

export default router;
