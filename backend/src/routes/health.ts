import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../db';
import { authenticate } from '../middleware/auth';
import { requireHorseAccess } from '../middleware/rbac';
import { HorsePermissionRequest } from '../types';

const router = Router();

// Configure multer for health record file uploads
const recordUploadsDir = path.join(process.cwd(), 'uploads', 'records');
fs.mkdirSync(recordUploadsDir, { recursive: true });

const recordStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, recordUploadsDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const recordUpload = multer({
  storage: recordStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf', '.heic'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only images (jpg, png, webp, gif, heic) and PDF files are allowed'));
    }
  },
});

// Helper: parse file upload with multer, returning a promise
function handleFileUpload(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    recordUpload.single('file')(req, res, (err) => {
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
}

// Helper: get file info from request
function getFileInfo(req: Request): { fileUrl: string | null; fileName: string | null } {
  if (req.file) {
    return {
      fileUrl: `/api/uploads/records/${req.file.filename}`,
      fileName: req.file.originalname,
    };
  }
  return { fileUrl: null, fileName: null };
}

// Helper: delete file from disk
function deleteFile(fileUrl: string | null) {
  if (!fileUrl) return;
  const filename = path.basename(fileUrl.split('?')[0]);
  fs.unlink(path.join(recordUploadsDir, filename), () => {});
}

// ─── Vet Visits ──────────────────────────────────────────────

router.get('/:horseId/vet-visits', authenticate, requireHorseAccess('VIEW'), async (req, res: Response) => {
  const visits = await prisma.vetVisit.findMany({
    where: { horseId: req.params.horseId },
    orderBy: { date: 'desc' },
  });
  res.json(visits);
});

router.post('/:horseId/vet-visits', authenticate, requireHorseAccess('EDIT'), async (req: HorsePermissionRequest, res: Response) => {
  try {
    await handleFileUpload(req, res);
    const { date, notes } = req.body;
    if (!date) { res.status(400).json({ error: 'Date is required' }); return; }
    const { fileUrl, fileName } = getFileInfo(req);
    const visit = await prisma.vetVisit.create({
      data: { horseId: req.params.horseId, date: new Date(date + 'T00:00:00Z'), notes: notes || null, fileUrl, fileName },
    });
    res.status(201).json(visit);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Upload error')) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error('Create vet visit error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:horseId/vet-visits/:recordId', authenticate, requireHorseAccess('EDIT'), async (req, res: Response) => {
  try {
    const record = await prisma.vetVisit.findUnique({ where: { id: req.params.recordId } });
    if (record?.fileUrl) deleteFile(record.fileUrl);
    await prisma.vetVisit.delete({ where: { id: req.params.recordId } });
    res.json({ message: 'Deleted' });
  } catch { res.status(404).json({ error: 'Not found' }); }
});

// ─── Farrier Visits ──────────────────────────────────────────

router.get('/:horseId/farrier-visits', authenticate, requireHorseAccess('VIEW'), async (req, res: Response) => {
  const visits = await prisma.farrierVisit.findMany({
    where: { horseId: req.params.horseId },
    orderBy: { date: 'desc' },
  });
  res.json(visits);
});

router.post('/:horseId/farrier-visits', authenticate, requireHorseAccess('EDIT'), async (req, res: Response) => {
  try {
    await handleFileUpload(req, res);
    const { date, notes } = req.body;
    if (!date) { res.status(400).json({ error: 'Date is required' }); return; }
    const { fileUrl, fileName } = getFileInfo(req);
    const visit = await prisma.farrierVisit.create({
      data: { horseId: req.params.horseId, date: new Date(date + 'T00:00:00Z'), notes: notes || null, fileUrl, fileName },
    });
    res.status(201).json(visit);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Upload error')) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error('Create farrier visit error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:horseId/farrier-visits/:recordId', authenticate, requireHorseAccess('EDIT'), async (req, res: Response) => {
  try {
    const record = await prisma.farrierVisit.findUnique({ where: { id: req.params.recordId } });
    if (record?.fileUrl) deleteFile(record.fileUrl);
    await prisma.farrierVisit.delete({ where: { id: req.params.recordId } });
    res.json({ message: 'Deleted' });
  } catch { res.status(404).json({ error: 'Not found' }); }
});

// ─── Vaccinations / Deworming ────────────────────────────────

router.get('/:horseId/vaccinations', authenticate, requireHorseAccess('VIEW'), async (req, res: Response) => {
  const records = await prisma.vaccinationRecord.findMany({
    where: { horseId: req.params.horseId },
    orderBy: { date: 'desc' },
  });
  res.json(records);
});

router.post('/:horseId/vaccinations', authenticate, requireHorseAccess('EDIT'), async (req, res: Response) => {
  try {
    await handleFileUpload(req, res);
    const { date, notes, name, dueDate } = req.body;
    if (!date) { res.status(400).json({ error: 'Date is required' }); return; }
    const { fileUrl, fileName } = getFileInfo(req);
    const record = await prisma.vaccinationRecord.create({
      data: {
        horseId: req.params.horseId,
        name: name || null,
        date: new Date(date + 'T00:00:00Z'),
        notes: notes || null,
        dueDate: dueDate ? new Date(dueDate + 'T00:00:00Z') : null,
        fileUrl,
        fileName,
      },
    });
    res.status(201).json(record);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Upload error')) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error('Create vaccination record error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:horseId/vaccinations/:recordId', authenticate, requireHorseAccess('EDIT'), async (req, res: Response) => {
  try {
    const record = await prisma.vaccinationRecord.findUnique({ where: { id: req.params.recordId } });
    if (record?.fileUrl) deleteFile(record.fileUrl);
    await prisma.vaccinationRecord.delete({ where: { id: req.params.recordId } });
    res.json({ message: 'Deleted' });
  } catch { res.status(404).json({ error: 'Not found' }); }
});

// ─── Expenses ────────────────────────────────────────────────

router.get('/:horseId/expenses', authenticate, requireHorseAccess('VIEW'), async (req, res: Response) => {
  const expenses = await prisma.expenseNote.findMany({
    where: { horseId: req.params.horseId },
    orderBy: { date: 'desc' },
  });
  res.json(expenses);
});

router.post('/:horseId/expenses', authenticate, requireHorseAccess('EDIT'), async (req, res: Response) => {
  try {
    await handleFileUpload(req, res);
    const { date, notes, amount } = req.body;
    if (!date) { res.status(400).json({ error: 'Date is required' }); return; }
    const { fileUrl, fileName } = getFileInfo(req);
    const expense = await prisma.expenseNote.create({
      data: {
        horseId: req.params.horseId,
        date: new Date(date + 'T00:00:00Z'),
        amount: amount ? parseFloat(amount) : null,
        notes: notes || null,
        fileUrl,
        fileName,
      },
    });
    res.status(201).json(expense);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Upload error')) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error('Create expense error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:horseId/expenses/:recordId', authenticate, requireHorseAccess('EDIT'), async (req, res: Response) => {
  try {
    const record = await prisma.expenseNote.findUnique({ where: { id: req.params.recordId } });
    if (record?.fileUrl) deleteFile(record.fileUrl);
    await prisma.expenseNote.delete({ where: { id: req.params.recordId } });
    res.json({ message: 'Deleted' });
  } catch { res.status(404).json({ error: 'Not found' }); }
});

export default router;
