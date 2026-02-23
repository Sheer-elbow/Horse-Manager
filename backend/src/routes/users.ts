import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { authenticate, requireAdmin } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

const updateUserSchema = z.object({
  name: z.string().nullable().optional(),
  role: z.enum(['ADMIN', 'USER']).optional(),
});

// GET /api/users - list all users (admin only)
router.get('/', authenticate, requireAdmin, async (_req, res: Response) => {
  try {
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
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id
router.get('/:id', authenticate, requireAdmin, async (req, res: Response) => {
  try {
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
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/users/:id (admin only)
router.put('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const data = updateUserSchema.parse(req.body);
    // Prevent demoting self from admin
    if (req.params.id === req.user!.userId && data.role && data.role !== 'ADMIN') {
      res.status(400).json({ error: 'Cannot change your own role' });
      return;
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.role !== undefined ? { role: data.role } : {}),
      },
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
    res.json(user);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    res.status(404).json({ error: 'User not found' });
  }
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
