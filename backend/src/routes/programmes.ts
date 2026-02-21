import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { authenticate, requireAdmin } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

const programmeSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
});

// GET /api/programmes
router.get('/', authenticate, async (_req, res: Response) => {
  const programmes = await prisma.programme.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { planBlocks: true } } },
  });
  res.json(programmes);
});

// POST /api/programmes (admin only)
router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const data = programmeSchema.parse(req.body);
    const programme = await prisma.programme.create({
      data: { ...data, description: data.description ?? null, createdById: req.user!.userId },
    });
    res.status(201).json(programme);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Create programme error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/programmes/:id
router.get('/:id', authenticate, async (req, res: Response) => {
  const programme = await prisma.programme.findUnique({
    where: { id: req.params.id },
    include: { planBlocks: { include: { horse: { select: { id: true, name: true } } } } },
  });
  if (!programme) {
    res.status(404).json({ error: 'Programme not found' });
    return;
  }
  res.json(programme);
});

// PUT /api/programmes/:id (admin only)
router.put('/:id', authenticate, requireAdmin, async (req, res: Response) => {
  try {
    const data = programmeSchema.parse(req.body);
    const programme = await prisma.programme.update({
      where: { id: req.params.id },
      data: { ...data, description: data.description ?? null },
    });
    res.json(programme);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    res.status(404).json({ error: 'Programme not found' });
  }
});

// DELETE /api/programmes/:id (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res: Response) => {
  try {
    await prisma.programme.delete({ where: { id: req.params.id } });
    res.json({ message: 'Programme deleted' });
  } catch {
    res.status(404).json({ error: 'Programme not found' });
  }
});

export default router;
