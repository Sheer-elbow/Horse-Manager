import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router({ mergeParams: true });

// GET /api/horses/:horseId/priority - list users who have this horse as priority
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { role, userId } = req.user!;
  // Only ADMIN or STABLE_LEAD of the horse's stable can view the full list
  const horse = await prisma.horse.findUnique({ where: { id: req.params.horseId }, select: { stableId: true } });
  if (!horse) { res.status(404).json({ error: 'Horse not found' }); return; }

  const isAdmin = role === 'ADMIN';
  const isLead = role === 'STABLE_LEAD' && horse.stableId
    ? !!(await prisma.stableAssignment.findUnique({ where: { userId_stableId: { userId, stableId: horse.stableId } } }))
    : false;

  if (!isAdmin && !isLead) {
    res.status(403).json({ error: 'Stable Lead or Admin access required' });
    return;
  }

  try {
    const priorities = await prisma.horsePriority.findMany({
      where: { horseId: req.params.horseId },
      include: { user: { select: { id: true, email: true, name: true, role: true } } },
    });
    res.json(priorities);
  } catch (err) {
    console.error('List horse priorities error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const prioritySchema = z.object({ userId: z.string().uuid() });

// POST /api/horses/:horseId/priority - assign a user as priority carer
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { role, userId: currentUserId } = req.user!;
  const horse = await prisma.horse.findUnique({ where: { id: req.params.horseId }, select: { stableId: true } });
  if (!horse) { res.status(404).json({ error: 'Horse not found' }); return; }

  const isAdmin = role === 'ADMIN';
  const isLead = role === 'STABLE_LEAD' && horse.stableId
    ? !!(await prisma.stableAssignment.findUnique({ where: { userId_stableId: { userId: currentUserId, stableId: horse.stableId } } }))
    : false;

  if (!isAdmin && !isLead) {
    res.status(403).json({ error: 'Stable Lead or Admin access required' });
    return;
  }

  try {
    const { userId } = prioritySchema.parse(req.body);
    const priority = await prisma.horsePriority.upsert({
      where: { userId_horseId: { userId, horseId: req.params.horseId } },
      create: { userId, horseId: req.params.horseId },
      update: {},
    });
    res.status(201).json(priority);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Create horse priority error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/horses/:horseId/priority/:priorityId
router.delete('/:priorityId', authenticate, async (req: AuthRequest, res: Response) => {
  const { role, userId: currentUserId } = req.user!;
  const horse = await prisma.horse.findUnique({ where: { id: req.params.horseId }, select: { stableId: true } });
  if (!horse) { res.status(404).json({ error: 'Horse not found' }); return; }

  const isAdmin = role === 'ADMIN';
  const isLead = role === 'STABLE_LEAD' && horse.stableId
    ? !!(await prisma.stableAssignment.findUnique({ where: { userId_stableId: { userId: currentUserId, stableId: horse.stableId } } }))
    : false;

  if (!isAdmin && !isLead) {
    res.status(403).json({ error: 'Stable Lead or Admin access required' });
    return;
  }

  try {
    await prisma.horsePriority.delete({ where: { id: req.params.priorityId } });
    res.json({ message: 'Priority removed' });
  } catch {
    res.status(404).json({ error: 'Priority not found' });
  }
});

export default router;
