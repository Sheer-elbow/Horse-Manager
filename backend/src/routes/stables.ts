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

const STABLE_INCLUDE = {
  _count: { select: { horses: true, stableAssignments: true } },
  owner: { select: { id: true, name: true, email: true } },
} as const;

/** Returns true if the user may manage (edit/delete) this stable */
function canManageStable(userId: string, role: string, stable: { ownerId: string | null }) {
  return role === 'ADMIN' || stable.ownerId === userId;
}

// GET /api/stables/my — stables the current user is assigned to OR owns
router.get('/my', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.user!;
    const [assignments, owned] = await Promise.all([
      prisma.stableAssignment.findMany({
        where: { userId },
        include: { stable: { include: STABLE_INCLUDE } },
      }),
      prisma.stable.findMany({
        where: { ownerId: userId },
        include: STABLE_INCLUDE,
      }),
    ]);
    const assignedStables = assignments.map((a) => a.stable);
    // Merge, deduplicating by id
    const seen = new Set(assignedStables.map((s) => s.id));
    const all = [...assignedStables, ...owned.filter((s) => !seen.has(s.id))];
    res.json(all);
  } catch (err) {
    console.error('List my stables error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/stables — list all stables (any authenticated user)
router.get('/', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const stables = await prisma.stable.findMany({
      orderBy: { name: 'asc' },
      include: STABLE_INCLUDE,
    });
    res.json(stables);
  } catch (err) {
    console.error('List stables error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/stables — admin or OWNER creating their own stable
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { userId, role } = req.user!;
  if (role !== 'ADMIN' && role !== 'OWNER') {
    res.status(403).json({ error: 'Admin or Owner access required' });
    return;
  }
  try {
    const data = stableSchema.parse(req.body);
    const stable = await prisma.stable.create({
      data: {
        name: data.name,
        address: data.address ?? null,
        ownerId: role === 'OWNER' ? userId : null,
      },
      include: STABLE_INCLUDE,
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

// GET /api/stables/:id — single stable with counts
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const stable = await prisma.stable.findUnique({
      where: { id: req.params.id },
      include: STABLE_INCLUDE,
    });
    if (!stable) {
      res.status(404).json({ error: 'Stable not found' });
      return;
    }
    res.json(stable);
  } catch (err) {
    console.error('Get stable error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/stables/:id/memberships — owners with horses in this stable
router.get('/:id/memberships', authenticate, async (req: AuthRequest, res: Response) => {
  const { userId, role } = req.user!;
  // ADMIN, STABLE_LEAD of this stable, or the stable owner
  if (role !== 'ADMIN') {
    const [assignment, stable] = await Promise.all([
      prisma.stableAssignment.findUnique({ where: { userId_stableId: { userId, stableId: req.params.id } } }),
      prisma.stable.findUnique({ where: { id: req.params.id }, select: { ownerId: true } }),
    ]);
    if (!assignment && stable?.ownerId !== userId) {
      res.status(403).json({ error: 'Stable Lead or Admin access required' });
      return;
    }
  }
  try {
    const memberships = await prisma.stableMembership.findMany({
      where: { stableId: req.params.id },
      include: { user: { select: { id: true, email: true, name: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(memberships);
  } catch (err) {
    console.error('List stable memberships error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/stables/:id — admin or stable owner
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const { userId, role } = req.user!;
  try {
    const existing = await prisma.stable.findUnique({ where: { id: req.params.id }, select: { ownerId: true } });
    if (!existing) { res.status(404).json({ error: 'Stable not found' }); return; }
    if (!canManageStable(userId, role, existing)) {
      res.status(403).json({ error: 'Admin or stable owner access required' }); return;
    }
    const data = stableSchema.parse(req.body);
    const stable = await prisma.stable.update({
      where: { id: req.params.id },
      data: { name: data.name, address: data.address ?? null },
      include: STABLE_INCLUDE,
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
    console.error('Update stable error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/stables/:id — admin or stable owner
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const { userId, role } = req.user!;
  try {
    const existing = await prisma.stable.findUnique({ where: { id: req.params.id }, select: { ownerId: true } });
    if (!existing) { res.status(404).json({ error: 'Stable not found' }); return; }
    if (!canManageStable(userId, role, existing)) {
      res.status(403).json({ error: 'Admin or stable owner access required' }); return;
    }
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

// GET /api/stables/memberships/mine — current user's own memberships
router.get('/memberships/mine', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const memberships = await prisma.stableMembership.findMany({
      where: { userId: req.user!.userId },
      include: { stable: { select: { id: true, name: true } } },
    });
    res.json(memberships);
  } catch (err) {
    console.error('List my memberships error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/stables/:id/memberships/request — OWNER requests to join a stable
router.post('/:id/memberships/request', authenticate, async (req: AuthRequest, res: Response) => {
  const { userId, role } = req.user!;
  if (role !== 'OWNER') {
    res.status(403).json({ error: 'Only horse owners can request stable membership' });
    return;
  }
  try {
    const stable = await prisma.stable.findUnique({ where: { id: req.params.id } });
    if (!stable) { res.status(404).json({ error: 'Stable not found' }); return; }

    const existing = await prisma.stableMembership.findUnique({
      where: { userId_stableId: { userId, stableId: req.params.id } },
    });
    if (existing) {
      res.status(409).json({ error: 'You already have a membership or pending request for this stable' });
      return;
    }

    const membership = await prisma.stableMembership.create({
      data: { userId, stableId: req.params.id, type: 'REQUESTED' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    res.status(201).json(membership);
  } catch (err) {
    console.error('Request membership error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/stables/:id/memberships/:userId/approve — STABLE_LEAD/admin approves request
router.post('/:id/memberships/:userId/approve', authenticate, async (req: AuthRequest, res: Response) => {
  const { userId: actorId, role } = req.user!;
  try {
    const [assignment, stable] = await Promise.all([
      prisma.stableAssignment.findUnique({ where: { userId_stableId: { userId: actorId, stableId: req.params.id } } }),
      prisma.stable.findUnique({ where: { id: req.params.id }, select: { ownerId: true } }),
    ]);
    if (role !== 'ADMIN' && !assignment && stable?.ownerId !== actorId) {
      res.status(403).json({ error: 'Stable Lead or Admin access required' }); return;
    }

    const membership = await prisma.stableMembership.update({
      where: { userId_stableId: { userId: req.params.userId, stableId: req.params.id } },
      data: { type: 'APPROVED' },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });
    res.json(membership);
  } catch (err) {
    console.error('Approve membership error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/stables/:id/memberships/:userId — reject/remove membership
router.delete('/:id/memberships/:userId', authenticate, async (req: AuthRequest, res: Response) => {
  const { userId: actorId, role } = req.user!;
  try {
    const [assignment, stable] = await Promise.all([
      prisma.stableAssignment.findUnique({ where: { userId_stableId: { userId: actorId, stableId: req.params.id } } }),
      prisma.stable.findUnique({ where: { id: req.params.id }, select: { ownerId: true } }),
    ]);
    // Actor can be admin, stable lead/owner, OR the member removing themselves
    if (role !== 'ADMIN' && !assignment && stable?.ownerId !== actorId && actorId !== req.params.userId) {
      res.status(403).json({ error: 'Access denied' }); return;
    }
    await prisma.stableMembership.delete({
      where: { userId_stableId: { userId: req.params.userId, stableId: req.params.id } },
    });
    res.json({ message: 'Membership removed' });
  } catch (err) {
    console.error('Remove membership error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
