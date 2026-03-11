import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { authenticate, requireAdmin } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

const stableSchema = z.object({
  name: z.string().min(1).max(100),
  address: z.string().nullable().optional(),
});

// GET /api/stables — list all stables (any authenticated user)
router.get('/', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const stables = await prisma.stable.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { horses: true } } },
    });
    res.json(stables);
  } catch (err) {
    console.error('List stables error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/stables (admin only)
router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const data = stableSchema.parse(req.body);
    const stable = await prisma.stable.create({
      data: { name: data.name, address: data.address ?? null },
    });
    res.status(201).json(stable);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    if ((err as { code?: string }).code === 'P2002') {
      res.status(409).json({ error: 'A stable with that name already exists' });
      return;
    }
    console.error('Create stable error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/stables/:id (admin only)
router.put('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const data = stableSchema.parse(req.body);
    const stable = await prisma.stable.update({
      where: { id: req.params.id },
      data: { name: data.name, address: data.address ?? null },
    });
    res.json(stable);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    if ((err as { code?: string }).code === 'P2002') {
      res.status(409).json({ error: 'A stable with that name already exists' });
      return;
    }
    res.status(404).json({ error: 'Stable not found' });
  }
});

// DELETE /api/stables/:id (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    // Check for horses still assigned
    const count = await prisma.horse.count({ where: { stableId: req.params.id } });
    if (count > 0) {
      res.status(409).json({ error: `Cannot delete: ${count} horse${count === 1 ? '' : 's'} still assigned to this stable` });
      return;
    }
    await prisma.stable.delete({ where: { id: req.params.id } });
    res.json({ message: 'Stable deleted' });
  } catch {
    res.status(404).json({ error: 'Stable not found' });
  }
});

export default router;
