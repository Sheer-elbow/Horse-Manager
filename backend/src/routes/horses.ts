import { Router, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { prisma } from '../db';
import { authenticate, requireAdmin, requireRole } from '../middleware/auth';
import { requireHorseAccess } from '../middleware/rbac';
import { AuthRequest, HorsePermissionRequest } from '../types';

const router = Router();

// Configure multer for horse photo uploads (memory storage — Sharp processes before disk write)
const uploadsDir = path.join(process.cwd(), 'uploads', 'horses');
fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // generous raw limit; Sharp output will be far smaller
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif']);
    if (allowed.has(ext) || ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpg, png, webp, gif, heic) are allowed'));
    }
  },
});

const horseSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().positive().nullable().optional(),
  breed: z.string().nullable().optional(),
  ownerNotes: z.string().nullable().optional(),
  stableLocation: z.string().nullable().optional(),
  stableId: z.string().uuid().nullable().optional(),
  identifyingInfo: z.string().nullable().optional(),
});

// GET /api/horses - list horses visible to user
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { role, userId } = req.user!;

    if (role === 'ADMIN') {
      const horses = await prisma.horse.findMany({
        orderBy: { name: 'asc' },
        include: { stable: { select: { id: true, name: true } } },
      });
      res.json(horses);
      return;
    }

    // Stable staff (STABLE_LEAD, RIDER, GROOM): see all horses in assigned stables
    if (role === 'STABLE_LEAD' || role === 'RIDER' || role === 'GROOM') {
      const stableAssignments = await prisma.stableAssignment.findMany({
        where: { userId },
        select: { stableId: true },
      });
      const stableIds = stableAssignments.map((a) => a.stableId);

      const [horses, priorities] = await Promise.all([
        prisma.horse.findMany({
          where: { stableId: { in: stableIds } },
          orderBy: { name: 'asc' },
          include: { stable: { select: { id: true, name: true } } },
        }),
        prisma.horsePriority.findMany({
          where: { userId },
          select: { horseId: true },
        }),
      ]);
      const prioritySet = new Set(priorities.map((p) => p.horseId));
      res.json(horses.map((h) => ({ ...h, _permission: 'VIEW', _isPriority: prioritySet.has(h.id) })));
      return;
    }

    // OWNER / TRAINER: only horses explicitly assigned via HorseAssignment
    const assignments = await prisma.horseAssignment.findMany({
      where: { userId },
      include: { horse: { include: { stable: { select: { id: true, name: true } } } } },
    });
    res.json(assignments.map((a) => ({ ...a.horse, _permission: a.permission })));
  } catch (err) {
    console.error('List horses error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/horses (admin + owner)
router.post('/', authenticate, requireRole('ADMIN', 'OWNER'), async (req: AuthRequest, res: Response) => {
  try {
    const data = horseSchema.parse(req.body);
    const horse = await prisma.horse.create({ data: { ...data, age: data.age ?? null, breed: data.breed ?? null, ownerNotes: data.ownerNotes ?? null, stableLocation: data.stableLocation ?? null, stableId: data.stableId ?? null, identifyingInfo: data.identifyingInfo ?? null } });

    // Auto-create a StableMembership for the owner when a horse is stabled
    if (horse.stableId && req.user!.role === 'OWNER') {
      await prisma.stableMembership.upsert({
        where: { userId_stableId: { userId: req.user!.userId, stableId: horse.stableId } },
        create: { userId: req.user!.userId, stableId: horse.stableId, type: 'AUTO' },
        update: {},
      });
    }

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
  try {
    const horse = await prisma.horse.findUnique({
      where: { id: req.params.id },
      include: {
        stable: { select: { id: true, name: true } },
        assignments: {
          include: { user: { select: { id: true, email: true, name: true } } },
        },
      },
    });
    if (!horse) {
      res.status(404).json({ error: 'Horse not found' });
      return;
    }

    // Check if this is a priority horse for the current user (stable staff only)
    let isPriority = false;
    const accessType = req.horseAccessType;
    if (accessType === 'LEAD_VIEW' || accessType === 'STAFF_VIEW') {
      const priority = await prisma.horsePriority.findUnique({
        where: { userId_horseId: { userId: req.user!.userId, horseId: req.params.id } },
      });
      isPriority = !!priority;
    }

    res.json({ ...horse, _permission: req.horsePermission, _accessType: accessType, _isPriority: isPriority });
  } catch (err) {
    console.error('Get horse error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/horses/:id (admin or owner with EDIT permission)
router.put('/:id', authenticate, requireHorseAccess('EDIT'), async (req: HorsePermissionRequest, res: Response) => {
  try {
    const data = horseSchema.parse(req.body);
    const horse = await prisma.horse.update({
      where: { id: req.params.id },
      data: { ...data, age: data.age ?? null, breed: data.breed ?? null, ownerNotes: data.ownerNotes ?? null, stableLocation: data.stableLocation ?? null, stableId: data.stableId ?? null, identifyingInfo: data.identifyingInfo ?? null },
    });

    // Auto-create/update StableMembership when an owner moves a horse to a stable
    if (horse.stableId && req.user!.role === 'OWNER') {
      await prisma.stableMembership.upsert({
        where: { userId_stableId: { userId: req.user!.userId, stableId: horse.stableId } },
        create: { userId: req.user!.userId, stableId: horse.stableId, type: 'AUTO' },
        update: {},
      });
    }

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

// POST /api/horses/:id/photo (admin only)
router.post('/:id/photo', authenticate, requireAdmin, (req: AuthRequest, res: Response) => {
  photoUpload.single('photo')(req, res, async (multerErr) => {
    if (multerErr) {
      console.error('Multer error:', multerErr);
      const msg = multerErr instanceof multer.MulterError
        ? `Upload error: ${multerErr.message}`
        : multerErr.message || 'Upload failed';
      res.status(400).json({ error: msg });
      return;
    }
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No photo uploaded' });
        return;
      }
      // Delete any existing photo for this horse (all extensions)
      const existing = await prisma.horse.findUnique({ where: { id: req.params.id } });
      if (existing?.photoUrl) {
        const oldFilename = path.basename(existing.photoUrl.split('?')[0]);
        fs.unlink(path.join(uploadsDir, oldFilename), () => {});
      }
      // Compress and convert to WebP (max 1200×1200, 82% quality)
      const filename = `${req.params.id}.webp`;
      await sharp(req.file.buffer)
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(path.join(uploadsDir, filename));
      const photoUrl = `/api/uploads/horses/${filename}?v=${Date.now()}`;
      const horse = await prisma.horse.update({
        where: { id: req.params.id },
        data: { photoUrl },
      });
      res.json(horse);
    } catch (err) {
      console.error('Upload photo error:', err);
      res.status(500).json({ error: 'Failed to upload photo' });
    }
  });
});

// DELETE /api/horses/:id/photo (admin only)
router.delete('/:id/photo', authenticate, requireAdmin, async (req, res: Response) => {
  try {
    const horse = await prisma.horse.findUnique({ where: { id: req.params.id } });
    if (!horse) {
      res.status(404).json({ error: 'Horse not found' });
      return;
    }
    if (horse.photoUrl) {
      const filename = path.basename(horse.photoUrl);
      const filepath = path.join(uploadsDir, filename);
      fs.unlink(filepath, () => {});
    }
    const updated = await prisma.horse.update({
      where: { id: req.params.id },
      data: { photoUrl: null },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to remove photo' });
  }
});

// ─── Horse Assignments ───────────────────────────────────────

const assignmentSchema = z.object({
  userId: z.string().uuid(),
  permission: z.enum(['VIEW', 'EDIT']),
});

// GET /api/horses/:id/assignments
router.get('/:id/assignments', authenticate, requireHorseAccess('VIEW'), async (req, res: Response) => {
  try {
    const assignments = await prisma.horseAssignment.findMany({
      where: { horseId: req.params.id },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    res.json(assignments);
  } catch (err) {
    console.error('List assignments error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
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
