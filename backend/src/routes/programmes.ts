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
router.get('/', authenticate, async (_req, res: Response) => {
  try {
    const programmes = await prisma.programme.findMany({
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

// GET /api/programmes/:id
router.get('/:id', authenticate, async (req, res: Response) => {
  try {
    const programme = await prisma.programme.findUnique({
      where: { id: req.params.id },
      include: { planBlocks: { include: { horse: { select: { id: true, name: true } } } } },
    });
    if (!programme) {
      res.status(404).json({ error: 'Programme not found' });
      return;
    }
    res.json(programme);
  } catch (err) {
    console.error('Get programme error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/programmes/:id (admin + trainer)
router.put('/:id', authenticate, requireRole('ADMIN', 'TRAINER'), async (req, res: Response) => {
  try {
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
    res.status(404).json({ error: 'Programme not found' });
  }
});

// DELETE /api/programmes/:id (admin + trainer)
router.delete('/:id', authenticate, requireRole('ADMIN', 'TRAINER'), async (req, res: Response) => {
  try {
    await prisma.programme.delete({ where: { id: req.params.id } });
    res.json({ message: 'Programme deleted' });
  } catch {
    res.status(404).json({ error: 'Programme not found' });
  }
});

export default router;
