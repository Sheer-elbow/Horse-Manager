import { Router, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import AdmZip from 'adm-zip';
import sanitizeHtml from 'sanitize-html';
import * as cheerio from 'cheerio';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { AuthRequest } from '../types';
import { parseScheduleCsv } from '../services/csv-schedule-parser';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB max
const uploadPackage = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB for ZIP

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

// POST /api/programmes/upload-package (admin + trainer) - upload ZIP with manual.html + schedule.csv
router.post('/upload-package', authenticate, requireRole('ADMIN', 'TRAINER'), uploadPackage.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    // Validate file extension
    const fileName = req.file.originalname.toLowerCase();
    if (!fileName.endsWith('.zip')) {
      res.status(400).json({ error: 'File must be a .zip archive' });
      return;
    }

    // Extract ZIP
    let zip: AdmZip;
    try {
      zip = new AdmZip(req.file.buffer);
    } catch {
      res.status(400).json({ error: 'Invalid or corrupted ZIP file' });
      return;
    }

    const entries = zip.getEntries();

    // Helper: get the bare filename from a ZIP entry (strips folder path)
    const bareFilename = (e: AdmZip.IZipEntry) => (e.entryName.split('/').pop() || '').toLowerCase();

    // Find schedule CSV (required) — prefer exact "schedule.csv", fall back to any .csv file
    const csvFiles = entries.filter(e => !e.isDirectory && bareFilename(e).endsWith('.csv'));
    const csvEntry = csvFiles.find(e => bareFilename(e) === 'schedule.csv') || csvFiles[0] || null;
    if (!csvEntry) {
      res.status(400).json({ error: 'ZIP must contain a .csv schedule file (e.g. schedule.csv)' });
      return;
    }

    // Find manual HTML/PDF — prefer "manual.html/htm", fall back to any .html/.htm, then .pdf
    const htmlFiles = entries.filter(e => !e.isDirectory && /\.html?$/i.test(bareFilename(e)));
    const pdfFiles = entries.filter(e => !e.isDirectory && /\.pdf$/i.test(bareFilename(e)));
    const htmlEntry = htmlFiles.find(e => /^manual\.html?$/.test(bareFilename(e))) || htmlFiles[0] || null;
    const pdfEntry = pdfFiles.find(e => /^manual\.pdf$/.test(bareFilename(e))) || pdfFiles[0] || null;

    if (!htmlEntry && !pdfEntry) {
      res.status(400).json({ error: 'ZIP must contain a manual file (.html or .pdf)' });
      return;
    }

    // Reject unexpected file types (only allow .csv, .html, .htm, .pdf, .txt, .md)
    const allowedExtensions = ['.csv', '.html', '.htm', '.pdf', '.txt', '.md'];
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const entryName = entry.entryName.split('/').pop() || '';
      const ext = entryName.includes('.') ? '.' + entryName.split('.').pop()!.toLowerCase() : '';
      if (ext && !allowedExtensions.includes(ext)) {
        res.status(400).json({ error: `ZIP contains disallowed file type: "${entryName}". Allowed: ${allowedExtensions.join(', ')}` });
        return;
      }
    }

    // Parse schedule CSV
    const csvContent = csvEntry.getData().toString('utf-8');
    const parseResult = parseScheduleCsv(csvContent);
    const fatalErrors = parseResult.errors.filter(e => !e.startsWith('Warning:'));
    if (fatalErrors.length > 0) {
      res.status(400).json({ error: 'Invalid schedule.csv', details: parseResult.errors });
      return;
    }
    if (parseResult.scheduleData.length === 0) {
      res.status(400).json({ error: 'schedule.csv produced no valid entries' });
      return;
    }

    // Process manual
    let manualHtml: string | null = null;
    let manualFileName: string | null = null;

    if (htmlEntry) {
      const rawHtml = htmlEntry.getData().toString('utf-8');
      // Sanitize HTML: allow safe tags for a training manual
      manualHtml = sanitizeHtml(rawHtml, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat([
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'img', 'figure', 'figcaption', 'section', 'article',
          'table', 'thead', 'tbody', 'tr', 'th', 'td',
          'dl', 'dt', 'dd', 'hr', 'br', 'span', 'div',
        ]),
        allowedAttributes: {
          ...sanitizeHtml.defaults.allowedAttributes,
          '*': ['id', 'class', 'style'],
          'img': ['src', 'alt', 'width', 'height'],
          'a': ['href', 'name', 'id'],
        },
        allowedSchemes: ['http', 'https', 'data'],
      });
      manualFileName = htmlEntry.entryName.split('/').pop() || 'manual.html';
    } else if (pdfEntry) {
      // Store PDF note — actual PDF viewer is a next-iteration feature
      manualFileName = pdfEntry.entryName.split('/').pop() || 'manual.pdf';
      manualHtml = `<p>PDF manual uploaded: ${manualFileName}. PDF viewer coming soon.</p>`;
    }

    // Determine programme name
    const name = req.body.name || req.file.originalname.replace(/\.zip$/i, '');
    const description = req.body.description || null;

    // Create Programme + ProgrammeVersion in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const programme = await tx.programme.create({
        data: {
          name,
          description,
          status: 'DRAFT',
          createdById: req.user!.userId,
        },
      });

      const version = await tx.programmeVersion.create({
        data: {
          programmeId: programme.id,
          version: 1,
          status: 'DRAFT',
          numWeeks: parseResult.numWeeks,
          manualHtml,
          manualFileName,
          scheduleData: parseResult.scheduleData as unknown as Prisma.InputJsonValue,
        },
      });

      return { programme, version };
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('Upload programme package error:', err);
    res.status(500).json({ error: 'Failed to process programme package' });
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
