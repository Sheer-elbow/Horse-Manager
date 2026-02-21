import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { authenticate, requireAdmin } from '../middleware/auth';
import { requireHorseAccess } from '../middleware/rbac';
import { AuthRequest, HorsePermissionRequest } from '../types';

const router = Router();

const horseSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().positive().nullable().optional(),
  breed: z.string().nullable().optional(),
  ownerNotes: z.string().nullable().optional(),
  stableLocation: z.string().nullable().optional(),
  identifyingInfo: z.string().nullable().optional(),
});

// GET /api/horses - list horses visible to user
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  if (req.user!.role === 'ADMIN') {
    const horses = await prisma.horse.findMany({ orderBy: { name: 'asc' } });
    res.json(horses);
    return;
  }

  // Non-admin: only horses they're assigned to
  const assignments = await prisma.horseAssignment.findMany({
    where: { userId: req.user!.userId },
    include: { horse: true },
  });
  res.json(assignments.map((a) => ({ ...a.horse, _permission: a.permission })));
});

// POST /api/horses (admin only)
router.post('/', authenticate, requireAdmin, async (req, res: Response) => {
  try {
    const data = horseSchema.parse(req.body);
    const horse = await prisma.horse.create({ data: { ...data, age: data.age ?? null, breed: data.breed ?? null, ownerNotes: data.ownerNotes ?? null, stableLocation: data.stableLocation ?? null, identifyingInfo: data.identifyingInfo ?? null } });
    res.status(201).json(horse);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Create horse error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/horses/:id
router.get('/:id', authenticate, requireHorseAccess('VIEW'), async (req: HorsePermissionRequest, res: Response) => {
  const horse = await prisma.horse.findUnique({
    where: { id: req.params.id },
    include: {
      assignments: {
        include: { user: { select: { id: true, email: true, name: true } } },
      },
    },
  });
  if (!horse) {
    res.status(404).json({ error: 'Horse not found' });
    return;
  }
  res.json({ ...horse, _permission: req.horsePermission });
});

// PUT /api/horses/:id (admin only)
router.put('/:id', authenticate, requireAdmin, async (req, res: Response) => {
  try {
    const data = horseSchema.parse(req.body);
    const horse = await prisma.horse.update({
      where: { id: req.params.id },
      data: { ...data, age: data.age ?? null, breed: data.breed ?? null, ownerNotes: data.ownerNotes ?? null, stableLocation: data.stableLocation ?? null, identifyingInfo: data.identifyingInfo ?? null },
    });
    res.json(horse);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    res.status(404).json({ error: 'Horse not found' });
  }
});

// DELETE /api/horses/:id (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res: Response) => {
  try {
    await prisma.horse.delete({ where: { id: req.params.id } });
    res.json({ message: 'Horse deleted' });
  } catch {
    res.status(404).json({ error: 'Horse not found' });
  }
});

// ─── Horse Assignments ───────────────────────────────────────

const assignmentSchema = z.object({
  userId: z.string().uuid(),
  permission: z.enum(['VIEW', 'EDIT']),
});

// GET /api/horses/:id/assignments
router.get('/:id/assignments', authenticate, requireHorseAccess('VIEW'), async (req, res: Response) => {
  const assignments = await prisma.horseAssignment.findMany({
    where: { horseId: req.params.id },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  res.json(assignments);
});

// POST /api/horses/:id/assignments (admin only)
router.post('/:id/assignments', authenticate, requireAdmin, async (req, res: Response) => {
  try {
    const data = assignmentSchema.parse(req.body);
    const assignment = await prisma.horseAssignment.upsert({
      where: { userId_horseId: { userId: data.userId, horseId: req.params.id } },
      create: { userId: data.userId, horseId: req.params.id, permission: data.permission },
      update: { permission: data.permission },
    });
    res.json(assignment);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Assignment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/horses/:id/assignments/:assignmentId (admin only)
router.delete('/:id/assignments/:assignmentId', authenticate, requireAdmin, async (req, res: Response) => {
  try {
    await prisma.horseAssignment.delete({ where: { id: req.params.assignmentId } });
    res.json({ message: 'Assignment removed' });
  } catch {
    res.status(404).json({ error: 'Assignment not found' });
  }
});

export default router;
