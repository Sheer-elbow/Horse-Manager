import { Router, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import * as cheerio from 'cheerio';
import { prisma } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB max

const programmeSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
});

// GET /api/programmes
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Trainers only see their own programmes; admins see all
    const where = req.user!.role === 'ADMIN' ? {} : { createdById: req.user!.userId };
    const programmes = await prisma.programme.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { _count: { select: { planBlocks: true } } },
    });
    res.json(programmes);
  } catch (err) {
    console.error('List programmes error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/programmes (admin + trainer)
router.post('/', authenticate, requireRole('ADMIN', 'TRAINER'), async (req: AuthRequest, res: Response) => {
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

// POST /api/programmes/upload (admin + trainer) - upload HTML programme file
router.post('/upload', authenticate, requireRole('ADMIN', 'TRAINER'), upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const htmlContent = req.file.buffer.toString('utf-8');
    const originalFileName = req.file.originalname;

    // Use filename (without extension) as programme name, or use form field
    const name = req.body.name || originalFileName.replace(/\.[^.]+$/, '');

    // Parse HTML to extract horse names from headings
    const $ = cheerio.load(htmlContent);
    const horseNames: string[] = [];
    $('h1, h2, h3').each((_, el) => {
      const text = $(el).text().trim();
      if (text && !horseNames.includes(text)) {
        horseNames.push(text);
      }
    });

    const programme = await prisma.programme.create({
      data: {
        name,
        description: req.body.description || null,
        htmlContent,
        originalFileName,
        horseNames,
        createdById: req.user!.userId,
      },
    });

    res.status(201).json(programme);
  } catch (err) {
    console.error('Upload programme error:', err);
    res.status(500).json({ error: 'Failed to upload programme' });
  }
});

// Helper: load programme with ownership check (trainers see only their own)
async function loadOwnedProgramme(req: AuthRequest, res: Response): Promise<{ id: string; createdById: string } | null> {
  const programme = await prisma.programme.findUnique({
    where: { id: req.params.id },
    select: { id: true, createdById: true },
  });
  if (!programme) {
    res.status(404).json({ error: 'Programme not found' });
    return null;
  }
  if (req.user!.role !== 'ADMIN' && programme.createdById !== req.user!.userId) {
    res.status(403).json({ error: 'Access denied' });
    return null;
  }
  return programme;
}

// GET /api/programmes/:id
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const owned = await loadOwnedProgramme(req, res);
    if (!owned) return;

    const programme = await prisma.programme.findUnique({
      where: { id: req.params.id },
      include: { planBlocks: { include: { horse: { select: { id: true, name: true } } } } },
    });
    res.json(programme);
  } catch (err) {
    console.error('Get programme error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/programmes/:id (admin + trainer, owner only)
router.put('/:id', authenticate, requireRole('ADMIN', 'TRAINER'), async (req: AuthRequest, res: Response) => {
  try {
    const owned = await loadOwnedProgramme(req, res);
    if (!owned) return;

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
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/programmes/:id (admin + trainer, owner only)
router.delete('/:id', authenticate, requireRole('ADMIN', 'TRAINER'), async (req: AuthRequest, res: Response) => {
  try {
    const owned = await loadOwnedProgramme(req, res);
    if (!owned) return;

    await prisma.programme.delete({ where: { id: req.params.id } });
    res.json({ message: 'Programme deleted' });
  } catch (err) {
    console.error('Delete programme error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Programme Versions ─────────────────────────────────────

const scheduleDaySchema = z.object({
  week: z.number().int().min(1),
  day: z.number().int().min(1).max(7),
  title: z.string().min(1),
  category: z.string().min(1),
  durationMin: z.number().int().positive().nullable(),
  durationMax: z.number().int().positive().nullable(),
  intensityLabel: z.string().nullable(),
  intensityRpeMin: z.number().int().min(1).max(10).nullable().optional(),
  intensityRpeMax: z.number().int().min(1).max(10).nullable().optional(),
  blocks: z.array(z.object({
    name: z.string().min(1),
    text: z.string(),
  })),
  substitution: z.string().nullable().optional(),
  manualRef: z.string().nullable().optional(),
});

const createVersionSchema = z.object({
  numWeeks: z.number().int().min(1).max(52),
  manualHtml: z.string().nullable().optional(),
  manualFileName: z.string().nullable().optional(),
  scheduleData: z.array(scheduleDaySchema),
});

// GET /api/programmes/:id/versions
router.get('/:id/versions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const owned = await loadOwnedProgramme(req, res);
    if (!owned) return;

    const versions = await prisma.programmeVersion.findMany({
      where: { programmeId: req.params.id },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        programmeId: true,
        version: true,
        status: true,
        numWeeks: true,
        manualFileName: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json(versions);
  } catch (err) {
    console.error('List programme versions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/programmes/:id/versions/:versionId
router.get('/:id/versions/:versionId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const owned = await loadOwnedProgramme(req, res);
    if (!owned) return;

    const version = await prisma.programmeVersion.findFirst({
      where: { id: req.params.versionId, programmeId: req.params.id },
    });
    if (!version) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }
    res.json(version);
  } catch (err) {
    console.error('Get programme version error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/programmes/:id/versions (create draft)
router.post('/:id/versions', authenticate, requireRole('ADMIN', 'TRAINER'), async (req: AuthRequest, res: Response) => {
  try {
    const owned = await loadOwnedProgramme(req, res);
    if (!owned) return;

    const data = createVersionSchema.parse(req.body);

    // Validate that scheduleData covers exactly numWeeks × 7 days
    const expectedDays = data.numWeeks * 7;
    if (data.scheduleData.length !== expectedDays) {
      res.status(400).json({
        error: `scheduleData must have exactly ${expectedDays} entries (${data.numWeeks} weeks × 7 days), got ${data.scheduleData.length}`,
      });
      return;
    }

    // Determine next version number
    const latest = await prisma.programmeVersion.findFirst({
      where: { programmeId: req.params.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    const version = await prisma.programmeVersion.create({
      data: {
        programmeId: req.params.id,
        version: nextVersion,
        status: 'DRAFT',
        numWeeks: data.numWeeks,
        manualHtml: data.manualHtml ?? null,
        manualFileName: data.manualFileName ?? null,
        scheduleData: data.scheduleData,
      },
    });

    // Set programme status to DRAFT if it has no status yet
    await prisma.programme.update({
      where: { id: req.params.id },
      data: { status: 'DRAFT' },
    });

    res.status(201).json(version);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Create programme version error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/programmes/:id/versions/:versionId/publish
router.post('/:id/versions/:versionId/publish', authenticate, requireRole('ADMIN', 'TRAINER'), async (req: AuthRequest, res: Response) => {
  try {
    const owned = await loadOwnedProgramme(req, res);
    if (!owned) return;

    const version = await prisma.programmeVersion.findFirst({
      where: { id: req.params.versionId, programmeId: req.params.id },
    });
    if (!version) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }
    if (version.status === 'PUBLISHED') {
      res.status(400).json({ error: 'Version is already published' });
      return;
    }
    if (version.status === 'ARCHIVED') {
      res.status(400).json({ error: 'Cannot publish an archived version' });
      return;
    }

    const now = new Date();
    const [published] = await prisma.$transaction([
      prisma.programmeVersion.update({
        where: { id: req.params.versionId },
        data: { status: 'PUBLISHED', publishedAt: now },
      }),
      prisma.programme.update({
        where: { id: req.params.id },
        data: { latestVersionId: req.params.versionId, status: 'PUBLISHED' },
      }),
    ]);

    res.json(published);
  } catch (err) {
    console.error('Publish programme version error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/programmes/:id/archive
router.patch('/:id/archive', authenticate, requireRole('ADMIN', 'TRAINER'), async (req: AuthRequest, res: Response) => {
  try {
    const owned = await loadOwnedProgramme(req, res);
    if (!owned) return;

    const programme = await prisma.programme.update({
      where: { id: req.params.id },
      data: { status: 'ARCHIVED' },
    });
    res.json(programme);
  } catch (err) {
    console.error('Archive programme error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
