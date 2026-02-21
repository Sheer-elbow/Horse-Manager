import { Router, Response } from 'express';
import { prisma } from '../db';
import { authenticate, requireAdmin } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

// GET /api/users - list all users (admin only)
router.get('/', authenticate, requireAdmin, async (_req, res: Response) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      assignments: {
        select: {
          id: true,
          horseId: true,
          permission: true,
          horse: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(users);
});

// GET /api/users/:id
router.get('/:id', authenticate, requireAdmin, async (req, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      assignments: {
        select: {
          id: true,
          horseId: true,
          permission: true,
          horse: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(user);
});

// DELETE /api/users/:id (admin only, cannot delete self)
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  if (req.params.id === req.user!.userId) {
    res.status(400).json({ error: 'Cannot delete yourself' });
    return;
  }
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: 'User deleted' });
  } catch {
    res.status(404).json({ error: 'User not found' });
  }
});

export default router;
