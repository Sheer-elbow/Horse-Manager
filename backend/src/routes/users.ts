import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { authenticate, requireAdmin } from '../middleware/auth';
import { logSecurityEvent } from '../services/securityLog';
import { AuthRequest } from '../types';

const router = Router();

const updateUserSchema = z.object({
  name: z.string().nullable().optional(),
  role: z.enum(['ADMIN', 'STABLE_LEAD', 'RIDER', 'GROOM', 'OWNER', 'TRAINER']).optional(),
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

// GET /api/users/me — current user's own profile (any authenticated user)
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json(user);
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const updateProfileSchema = z.object({
  name: z.string().min(1).nullable().optional(),
});

// PUT /api/users/me — update own name (any authenticated user)
router.put('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const body = updateProfileSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { name: body.name ?? undefined },
      select: { id: true, email: true, name: true, role: true },
    });
    res.json(user);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Update profile error:', err);
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

    // Capture existing role before the update so we can detect role changes
    const existing = data.role !== undefined
      ? await prisma.user.findUnique({
          where: { id: req.params.id },
          select: { role: true, email: true },
        })
      : null;

    // Prevent demoting the last admin — there must always be at least one
    if (existing?.role === 'ADMIN' && data.role !== 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        res.status(400).json({ error: 'Cannot demote the last admin account' });
        return;
      }
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

    if (existing && data.role !== undefined && data.role !== existing.role) {
      void logSecurityEvent('ROLE_CHANGED', req, {
        userId: req.user!.userId,
        email: req.user!.email,
        outcome: 'info',
        metadata: {
          targetId: user.id,
          targetEmail: user.email,
          fromRole: existing.role,
          toRole: data.role,
        },
      });
    }

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
    // Fetch before deleting so we can record who was removed
    const toDelete = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { email: true, name: true, role: true },
    });
    await prisma.user.delete({ where: { id: req.params.id } });
    void logSecurityEvent('USER_DELETED', req, {
      userId: req.user!.userId,
      email: req.user!.email,
      outcome: 'info',
      metadata: {
        deletedId: req.params.id,
        deletedEmail: toDelete?.email,
        deletedName: toDelete?.name,
        deletedRole: toDelete?.role,
      },
    });
    res.json({ message: 'User deleted' });
  } catch {
    res.status(404).json({ error: 'User not found' });
  }
});

export default router;
