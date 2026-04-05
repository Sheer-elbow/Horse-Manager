import { Router, Response } from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
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

// GET /api/users/me/export — download all personal data (GDPR Art 20)
router.get('/me/export', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const data = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, role: true, createdAt: true,
        acceptedTermsAt: true, acceptedPrivacyAt: true,
        assignments: {
          select: {
            permission: true,
            horse: {
              select: {
                id: true, name: true, age: true, breed: true, ownerNotes: true,
                stableLocation: true, identifyingInfo: true, createdAt: true,
              },
            },
          },
        },
        stableAssignments: {
          select: { stable: { select: { id: true, name: true, address: true } }, createdAt: true },
        },
        stableMemberships: {
          select: { stable: { select: { id: true, name: true } }, type: true, createdAt: true },
        },
        sessionLogs: {
          select: {
            id: true, date: true, slot: true, sessionType: true,
            durationMinutes: true, intensityRpe: true, notes: true,
            rider: true, deviationReason: true, createdAt: true,
            horse: { select: { id: true, name: true } },
          },
        },
        notificationPreference: true,
        ownedStables: {
          select: { id: true, name: true, address: true, createdAt: true },
        },
      },
    });
    if (!data) { res.status(404).json({ error: 'User not found' }); return; }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="smart-stable-manager-export-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json({ exportedAt: new Date().toISOString(), data });
  } catch (err) {
    console.error('Data export error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/me — self-service account deletion (GDPR Art 17)
router.delete('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    // Prevent the last admin from deleting themselves
    if (user.role === 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        res.status(400).json({ error: 'Cannot delete the last admin account. Transfer admin role first.' });
        return;
      }
    }

    // Check for owned stables — require transfer or deletion first
    const ownedStables = await prisma.stable.count({ where: { ownerId: userId } });
    if (ownedStables > 0) {
      res.status(400).json({ error: 'You own one or more stables. Please transfer ownership or delete them before deleting your account.' });
      return;
    }

    // Clean up uploaded files associated with horses the user owns exclusively
    const exclusiveHorses = await prisma.horseAssignment.findMany({
      where: { userId, permission: 'EDIT' },
      select: { horseId: true },
    });
    for (const { horseId } of exclusiveHorses) {
      const otherEditors = await prisma.horseAssignment.count({
        where: { horseId, permission: 'EDIT', userId: { not: userId } },
      });
      if (otherEditors === 0) {
        // This user is the sole editor — delete the horse's uploaded files
        const horse = await prisma.horse.findUnique({ where: { id: horseId }, select: { photoUrl: true } });
        if (horse?.photoUrl) {
          const filePath = path.join(process.cwd(), horse.photoUrl.replace(/^\/api\/uploads\//, 'uploads/'));
          try { fs.unlinkSync(filePath); } catch { /* file may already be gone */ }
        }
      }
    }

    // Anonymise security events rather than deleting them (retain audit trail)
    await prisma.securityEvent.updateMany({
      where: { userId },
      data: { userId: null, email: null },
    });

    // Delete the user — cascading deletes handle assignments, tokens, preferences, etc.
    await prisma.user.delete({ where: { id: userId } });

    void logSecurityEvent('USER_DELETED', req, {
      outcome: 'info',
      metadata: { selfDeletion: true, deletedEmail: user.email },
    });

    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error('Self-deletion error:', err);
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
