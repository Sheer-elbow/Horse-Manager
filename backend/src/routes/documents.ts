import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { prisma } from '../db';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const router = Router({ mergeParams: true }); // gives us :horseId

// ─── File upload setup ────────────────────────────────────────

const recordUploadsDir = path.join(process.cwd(), 'uploads', 'records');
fs.mkdirSync(recordUploadsDir, { recursive: true });

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif']);

const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext) || IMAGE_MIME_TYPES.has(file.mimetype) || ext === '.pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only images and PDF files are allowed'));
    }
  },
});

async function handleFileUpload(req: Request, res: Response): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    docUpload.single('file')(req, res, (err) => {
      if (err) {
        const msg = err instanceof multer.MulterError
          ? `Upload error: ${err.message}`
          : err.message || 'Upload failed';
        reject(new Error(msg));
      } else {
        resolve();
      }
    });
  });

  if (!req.file) return;

  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const ext = path.extname(req.file.originalname).toLowerCase();
  const isImage = IMAGE_MIME_TYPES.has(req.file.mimetype) || IMAGE_EXTENSIONS.has(ext);

  if (isImage) {
    const filename = `${uniqueSuffix}.webp`;
    await sharp(req.file.buffer)
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(path.join(recordUploadsDir, filename));
    req.file.filename = filename;
  } else {
    const filename = `${uniqueSuffix}.pdf`;
    fs.writeFileSync(path.join(recordUploadsDir, filename), req.file.buffer);
    req.file.filename = filename;
  }
}

// ─── Access helpers ───────────────────────────────────────────

/**
 * VIEW access to a horse's documents:
 *  - ADMIN always
 *  - Direct HorseAssignment (VIEW or EDIT)
 *  - StableAssignment for the horse's stable (lead/rider/groom assigned to the stable)
 *  - Stable owner (user who owns the stable the horse is in)
 *  - StableMembership (APPROVED horse owner with a membership record in the stable)
 */
async function canAccessHorse(userId: string, role: string, horseId: string): Promise<boolean> {
  if (role === 'ADMIN') return true;

  const assignment = await prisma.horseAssignment.findUnique({
    where: { userId_horseId: { userId, horseId } },
  });
  if (assignment) return true;

  const horse = await prisma.horse.findUnique({ where: { id: horseId }, select: { stableId: true } });
  if (!horse?.stableId) return false;

  const [stable, stableAssignment, membership] = await Promise.all([
    prisma.stable.findUnique({ where: { id: horse.stableId }, select: { ownerId: true } }),
    prisma.stableAssignment.findUnique({ where: { userId_stableId: { userId, stableId: horse.stableId } } }),
    prisma.stableMembership.findFirst({ where: { userId, stableId: horse.stableId } }),
  ]);
  return stable?.ownerId === userId || !!stableAssignment || !!membership;
}

/**
 * EDIT access to a horse's documents:
 *  - ADMIN always
 *  - HorseAssignment with EDIT permission
 *  - Stable owner (user who owns the stable the horse is in)
 *  - STABLE_LEAD with a StableAssignment for the horse's stable
 */
async function canEditHorse(userId: string, role: string, horseId: string): Promise<boolean> {
  if (role === 'ADMIN') return true;

  const assignment = await prisma.horseAssignment.findUnique({
    where: { userId_horseId: { userId, horseId } },
  });
  if (assignment?.permission === 'EDIT') return true;

  const horse = await prisma.horse.findUnique({ where: { id: horseId }, select: { stableId: true } });
  if (!horse?.stableId) return false;

  const stable = await prisma.stable.findUnique({ where: { id: horse.stableId }, select: { ownerId: true } });
  if (stable?.ownerId === userId) return true;

  if (role === 'STABLE_LEAD') {
    const stableAssignment = await prisma.stableAssignment.findUnique({
      where: { userId_stableId: { userId, stableId: horse.stableId } },
    });
    if (stableAssignment) return true;
  }
  return false;
}

// ─── GET /api/horses/:horseId/documents ───────────────────────

router.get('/', authenticate, async (req: Request, res: Response) => {
  const { user } = req as AuthRequest;
  const { horseId } = req.params;

  if (!(await canAccessHorse(user!.userId, user!.role, horseId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const docs = await db.horseDocument.findMany({
    where: { horseId },
    orderBy: [{ expiresAt: 'asc' }, { createdAt: 'desc' }],
    include: { uploadedBy: { select: { id: true, name: true, email: true } } },
  });

  res.json(docs);
});

// ─── POST /api/horses/:horseId/documents ─────────────────────

router.post('/', authenticate, async (req: Request, res: Response) => {
  const { user } = req as AuthRequest;
  const { horseId } = req.params;

  if (!(await canEditHorse(user!.userId, user!.role, horseId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    await handleFileUpload(req, res);
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Upload failed' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'A file is required' });
    return;
  }

  const { name, category, expiresAt, notes } = req.body as {
    name?: string;
    category?: string;
    expiresAt?: string;
    notes?: string;
  };

  if (!name?.trim()) {
    res.status(400).json({ error: 'Document name is required' });
    return;
  }

  const doc = await db.horseDocument.create({
    data: {
      horseId,
      uploadedById: user!.userId,
      name: name.trim(),
      category: category?.trim() || 'Other',
      fileUrl: `/api/uploads/records/${req.file.filename}`,
      fileName: req.file.originalname,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      notes: notes?.trim() || null,
    },
    include: { uploadedBy: { select: { id: true, name: true, email: true } } },
  });

  res.status(201).json(doc);
});

// ─── DELETE /api/horses/:horseId/documents/:docId ────────────

router.delete('/:docId', authenticate, async (req: Request, res: Response) => {
  const { user } = req as AuthRequest;
  const { horseId, docId } = req.params;

  if (!(await canEditHorse(user!.userId, user!.role, horseId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const doc = await db.horseDocument.findFirst({ where: { id: docId, horseId } });
  if (!doc) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  // Delete file from disk
  const filePath = path.join(process.cwd(), 'uploads', 'records', path.basename(doc.fileUrl));
  try { fs.unlinkSync(filePath); } catch { /* already gone */ }

  await db.horseDocument.delete({ where: { id: docId } });
  res.status(204).end();
});

// ─── GET /api/documents/expiring ─────────────────────────────
// Exposed separately from the router — see index.ts

export async function getExpiringDocuments(userId: string, role: string): Promise<unknown[]> {
  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let horseFilter: { horseId?: { in: string[] } } = {};

  if (role !== 'ADMIN') {
    // Collect all horse IDs the user can access:
    //  - via HorseAssignment (owner/trainer)
    //  - via StableAssignment (lead/rider/groom) — any horse in that stable
    //  - via stable ownership — any horse in stables the user owns
    //  - via StableMembership — any horse in stables the user is a member of
    const [assignments, stableAssignments, ownedStables, memberships] = await Promise.all([
      prisma.horseAssignment.findMany({ where: { userId }, select: { horseId: true } }),
      prisma.stableAssignment.findMany({ where: { userId }, select: { stableId: true } }),
      prisma.stable.findMany({ where: { ownerId: userId }, select: { id: true } }),
      prisma.stableMembership.findMany({ where: { userId }, select: { stableId: true } }),
    ]);

    const stableIds = Array.from(new Set([
      ...stableAssignments.map((s) => s.stableId),
      ...ownedStables.map((s) => s.id),
      ...memberships.map((m) => m.stableId),
    ]));

    const stableHorses = stableIds.length > 0
      ? await prisma.horse.findMany({ where: { stableId: { in: stableIds } }, select: { id: true } })
      : [];

    const ids = Array.from(new Set([
      ...assignments.map((a) => a.horseId),
      ...stableHorses.map((h) => h.id),
    ]));
    if (ids.length === 0) return [];
    horseFilter = { horseId: { in: ids } };
  }

  return db.horseDocument.findMany({
    where: {
      ...horseFilter,
      expiresAt: { not: null, lte: in30Days },
    },
    orderBy: { expiresAt: 'asc' },
    include: { horse: { select: { id: true, name: true } } },
  });
}

export default router;
