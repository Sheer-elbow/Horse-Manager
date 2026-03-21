import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { prisma } from '../db';
import { authenticate } from '../middleware/auth';
import { requireHorseAccess } from '../middleware/rbac';
import { HorsePermissionRequest } from '../types';

const router = Router();

// Configure multer for health record file uploads (memory storage — images processed by Sharp)
const recordUploadsDir = path.join(process.cwd(), 'uploads', 'records');
fs.mkdirSync(recordUploadsDir, { recursive: true });

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif']);

const recordUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // generous raw limit; compressed output will be much smaller
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext) || IMAGE_MIME_TYPES.has(file.mimetype) || ext === '.pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only images (jpg, png, webp, gif, heic) and PDF files are allowed'));
    }
  },
});

// Helper: parse file upload with multer then process images with Sharp
async function handleFileUpload(req: Request, res: Response): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    recordUpload.single('file')(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          console.error('Multer error:', err.code, err.message);
        }
        const msg = err instanceof multer.MulterError ? 'File upload failed' : err.message || 'Upload failed';
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
    // Compress and convert to WebP (max 1600px longest side, 85% quality)
    const filename = `${uniqueSuffix}.webp`;
    await sharp(req.file.buffer)
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(path.join(recordUploadsDir, filename));
    req.file.filename = filename;
  } else {
    // PDF — write buffer directly to disk unchanged
    const filename = `${uniqueSuffix}.pdf`;
    fs.writeFileSync(path.join(recordUploadsDir, filename), req.file.buffer);
    req.file.filename = filename;
  }
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

// ─── Health access helpers ────────────────────────────────────

/**
 * Checks whether a STAFF_VIEW user (rider/groom) has priority on this horse.
 * STAFF_VIEW users can only see full health records for their priority horses.
 */
async function checkStaffHealthAccess(req: HorsePermissionRequest, res: Response): Promise<boolean> {
  if (req.horseAccessType !== 'STAFF_VIEW') return true;
  const priority = await prisma.horsePriority.findUnique({
    where: { userId_horseId: { userId: req.user!.userId, horseId: req.params.horseId } },
  });
  if (!priority) {
    res.status(403).json({ error: 'Health records are only available for your priority horses' });
    return false;
  }
  return true;
}

/**
 * Strips notes, fileUrl and fileName from records for LEAD_VIEW users (summary only).
 */
function toHealthSummary<T extends { notes?: string | null; fileUrl?: string | null; fileName?: string | null }>(records: T[]): Omit<T, 'notes' | 'fileUrl' | 'fileName'>[] {
  return records.map(({ notes: _n, fileUrl: _f, fileName: _fn, ...rest }) => rest);
}

// ─── Vet Visits ──────────────────────────────────────────────

router.get('/:horseId/vet-visits', authenticate, requireHorseAccess('VIEW'), async (req: HorsePermissionRequest, res: Response) => {
  try {
    if (!await checkStaffHealthAccess(req, res)) return;
    const visits = await prisma.vetVisit.findMany({
      where: { horseId: req.params.horseId },
      orderBy: { date: 'desc' },
    });
    res.json(req.horseAccessType === 'LEAD_VIEW' ? toHealthSummary(visits) : visits);
  } catch (err) {
    console.error('List vet visits error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:horseId/vet-visits', authenticate, requireHorseAccess('EDIT'), async (req: HorsePermissionRequest, res: Response) => {
  try {
    await handleFileUpload(req, res);
    const { date, notes, vetName, visitReason, dueDate } = req.body;
    if (!date) { res.status(400).json({ error: 'Date is required' }); return; }
    const { fileUrl, fileName } = getFileInfo(req);
    const visit = await prisma.vetVisit.create({
      data: { horseId: req.params.horseId, date: new Date(date + 'T00:00:00Z'), vetName: vetName || null, visitReason: visitReason || null, notes: notes || null, dueDate: dueDate ? new Date(dueDate + 'T00:00:00Z') : null, fileUrl, fileName },
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

router.put('/:horseId/vet-visits/:recordId', authenticate, requireHorseAccess('EDIT'), async (req: HorsePermissionRequest, res: Response) => {
  try {
    await handleFileUpload(req, res);
    const { date, notes, vetName, visitReason, dueDate } = req.body;
    if (!date) { res.status(400).json({ error: 'Date is required' }); return; }
    const existing = await prisma.vetVisit.findUnique({ where: { id: req.params.recordId } });
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
    let fileUrl = existing.fileUrl;
    let fileName = existing.fileName;
    if (req.file) {
      deleteFile(existing.fileUrl);
      ({ fileUrl, fileName } = getFileInfo(req));
    }
    const visit = await prisma.vetVisit.update({
      where: { id: req.params.recordId },
      data: { date: new Date(date + 'T00:00:00Z'), vetName: vetName || null, visitReason: visitReason || null, notes: notes || null, dueDate: dueDate ? new Date(dueDate + 'T00:00:00Z') : null, fileUrl, fileName },
    });
    res.json(visit);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Upload error')) { res.status(400).json({ error: err.message }); return; }
    console.error('Update vet visit error:', err);
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

router.get('/:horseId/farrier-visits', authenticate, requireHorseAccess('VIEW'), async (req: HorsePermissionRequest, res: Response) => {
  try {
    if (!await checkStaffHealthAccess(req, res)) return;
    const visits = await prisma.farrierVisit.findMany({
      where: { horseId: req.params.horseId },
      orderBy: { date: 'desc' },
    });
    res.json(req.horseAccessType === 'LEAD_VIEW' ? toHealthSummary(visits) : visits);
  } catch (err) {
    console.error('List farrier visits error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:horseId/farrier-visits', authenticate, requireHorseAccess('EDIT'), async (req, res: Response) => {
  try {
    await handleFileUpload(req, res);
    const { date, notes, farrierName, dueDate } = req.body;
    if (!date) { res.status(400).json({ error: 'Date is required' }); return; }
    const { fileUrl, fileName } = getFileInfo(req);
    const visit = await prisma.farrierVisit.create({
      data: { horseId: req.params.horseId, date: new Date(date + 'T00:00:00Z'), farrierName: farrierName || null, notes: notes || null, dueDate: dueDate ? new Date(dueDate + 'T00:00:00Z') : null, fileUrl, fileName },
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

router.put('/:horseId/farrier-visits/:recordId', authenticate, requireHorseAccess('EDIT'), async (req, res: Response) => {
  try {
    await handleFileUpload(req, res);
    const { date, notes, farrierName, dueDate } = req.body;
    if (!date) { res.status(400).json({ error: 'Date is required' }); return; }
    const existing = await prisma.farrierVisit.findUnique({ where: { id: req.params.recordId } });
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
    let fileUrl = existing.fileUrl;
    let fileName = existing.fileName;
    if (req.file) { deleteFile(existing.fileUrl); ({ fileUrl, fileName } = getFileInfo(req)); }
    const visit = await prisma.farrierVisit.update({
      where: { id: req.params.recordId },
      data: { date: new Date(date + 'T00:00:00Z'), farrierName: farrierName || null, notes: notes || null, dueDate: dueDate ? new Date(dueDate + 'T00:00:00Z') : null, fileUrl, fileName },
    });
    res.json(visit);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Upload error')) { res.status(400).json({ error: err.message }); return; }
    console.error('Update farrier visit error:', err);
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

// ─── Dentist Visits ──────────────────────────────────────────

router.get('/:horseId/dentist-visits', authenticate, requireHorseAccess('VIEW'), async (req: HorsePermissionRequest, res: Response) => {
  try {
    if (!await checkStaffHealthAccess(req, res)) return;
    const visits = await prisma.dentistVisit.findMany({
      where: { horseId: req.params.horseId },
      orderBy: { date: 'desc' },
    });
    res.json(req.horseAccessType === 'LEAD_VIEW' ? toHealthSummary(visits) : visits);
  } catch (err) {
    console.error('List dentist visits error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:horseId/dentist-visits', authenticate, requireHorseAccess('EDIT'), async (req, res: Response) => {
  try {
    await handleFileUpload(req, res);
    const { date, notes, dentistName, dueDate } = req.body;
    if (!date) { res.status(400).json({ error: 'Date is required' }); return; }
    const { fileUrl, fileName } = getFileInfo(req);
    const visit = await prisma.dentistVisit.create({
      data: { horseId: req.params.horseId, date: new Date(date + 'T00:00:00Z'), dentistName: dentistName || null, notes: notes || null, dueDate: dueDate ? new Date(dueDate + 'T00:00:00Z') : null, fileUrl, fileName },
    });
    res.status(201).json(visit);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Upload error')) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error('Create dentist visit error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:horseId/dentist-visits/:recordId', authenticate, requireHorseAccess('EDIT'), async (req, res: Response) => {
  try {
    await handleFileUpload(req, res);
    const { date, notes, dentistName, dueDate } = req.body;
    if (!date) { res.status(400).json({ error: 'Date is required' }); return; }
    const existing = await prisma.dentistVisit.findUnique({ where: { id: req.params.recordId } });
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
    let fileUrl = existing.fileUrl;
    let fileName = existing.fileName;
    if (req.file) { deleteFile(existing.fileUrl); ({ fileUrl, fileName } = getFileInfo(req)); }
    const visit = await prisma.dentistVisit.update({
      where: { id: req.params.recordId },
      data: { date: new Date(date + 'T00:00:00Z'), dentistName: dentistName || null, notes: notes || null, dueDate: dueDate ? new Date(dueDate + 'T00:00:00Z') : null, fileUrl, fileName },
    });
    res.json(visit);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Upload error')) { res.status(400).json({ error: err.message }); return; }
    console.error('Update dentist visit error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:horseId/dentist-visits/:recordId', authenticate, requireHorseAccess('EDIT'), async (req, res: Response) => {
  try {
    const record = await prisma.dentistVisit.findUnique({ where: { id: req.params.recordId } });
    if (record?.fileUrl) deleteFile(record.fileUrl);
    await prisma.dentistVisit.delete({ where: { id: req.params.recordId } });
    res.json({ message: 'Deleted' });
  } catch { res.status(404).json({ error: 'Not found' }); }
});

// ─── Vaccinations / Deworming ────────────────────────────────

router.get('/:horseId/vaccinations', authenticate, requireHorseAccess('VIEW'), async (req: HorsePermissionRequest, res: Response) => {
  try {
    if (!await checkStaffHealthAccess(req, res)) return;
    const records = await prisma.vaccinationRecord.findMany({
      where: { horseId: req.params.horseId },
      orderBy: { date: 'desc' },
    });
    res.json(req.horseAccessType === 'LEAD_VIEW' ? toHealthSummary(records) : records);
  } catch (err) {
    console.error('List vaccinations error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
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

router.put('/:horseId/vaccinations/:recordId', authenticate, requireHorseAccess('EDIT'), async (req, res: Response) => {
  try {
    await handleFileUpload(req, res);
    const { date, notes, name, dueDate } = req.body;
    if (!date) { res.status(400).json({ error: 'Date is required' }); return; }
    const existing = await prisma.vaccinationRecord.findUnique({ where: { id: req.params.recordId } });
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
    let fileUrl = existing.fileUrl;
    let fileName = existing.fileName;
    if (req.file) { deleteFile(existing.fileUrl); ({ fileUrl, fileName } = getFileInfo(req)); }
    const record = await prisma.vaccinationRecord.update({
      where: { id: req.params.recordId },
      data: { date: new Date(date + 'T00:00:00Z'), name: name || null, notes: notes || null, dueDate: dueDate ? new Date(dueDate + 'T00:00:00Z') : null, fileUrl, fileName },
    });
    res.json(record);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Upload error')) { res.status(400).json({ error: err.message }); return; }
    console.error('Update vaccination record error:', err);
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

router.get('/:horseId/expenses', authenticate, requireHorseAccess('VIEW'), async (req: HorsePermissionRequest, res: Response) => {
  // Only owners and admins can view expense records
  if (req.horseAccessType !== 'ADMIN' && req.horseAccessType !== 'OWNER_EDIT') {
    res.status(403).json({ error: 'Only horse owners can view expense records' });
    return;
  }
  try {
    const expenses = await prisma.expenseNote.findMany({
      where: { horseId: req.params.horseId },
      orderBy: { date: 'desc' },
    });
    res.json(expenses);
  } catch (err) {
    console.error('List expenses error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:horseId/expenses', authenticate, requireHorseAccess('EDIT'), async (req, res: Response) => {
  try {
    await handleFileUpload(req, res);
    const { date, notes, amount, category } = req.body;
    if (!date) { res.status(400).json({ error: 'Date is required' }); return; }
    const parsedAmount = amount !== undefined && amount !== '' ? parseFloat(amount) : null;
    if (parsedAmount !== null && (isNaN(parsedAmount) || parsedAmount < 0 || parsedAmount > 10_000_000)) {
      res.status(400).json({ error: 'Amount must be a non-negative number up to 10,000,000' });
      return;
    }
    const { fileUrl, fileName } = getFileInfo(req);
    const expense = await prisma.expenseNote.create({
      data: {
        horseId: req.params.horseId,
        date: new Date(date + 'T00:00:00Z'),
        amount: parsedAmount,
        category: category || null,
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

router.put('/:horseId/expenses/:recordId', authenticate, requireHorseAccess('EDIT'), async (req, res: Response) => {
  try {
    await handleFileUpload(req, res);
    const { date, notes, amount, category } = req.body;
    if (!date) { res.status(400).json({ error: 'Date is required' }); return; }
    const existing = await prisma.expenseNote.findUnique({ where: { id: req.params.recordId } });
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
    let fileUrl = existing.fileUrl;
    let fileName = existing.fileName;
    if (req.file) { deleteFile(existing.fileUrl); ({ fileUrl, fileName } = getFileInfo(req)); }
    const expense = await prisma.expenseNote.update({
      where: { id: req.params.recordId },
      data: { date: new Date(date + 'T00:00:00Z'), category: category || null, amount: amount ? parseFloat(amount) : null, notes: notes || null, fileUrl, fileName },
    });
    res.json(expense);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Upload error')) { res.status(400).json({ error: err.message }); return; }
    console.error('Update expense error:', err);
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

// ─── Health Timeline ──────────────────────────────────────────
// Returns all health events for a horse merged into one chronological array.

router.get('/:horseId/timeline', authenticate, requireHorseAccess('VIEW'), async (req: HorsePermissionRequest, res: Response) => {
  try {
    if (!await checkStaffHealthAccess(req, res)) return;
    const horseId = req.params.horseId;
    const isLead = req.horseAccessType === 'LEAD_VIEW';

    const [vets, farriers, dentists, vaccines, expenses] = await Promise.all([
      prisma.vetVisit.findMany({ where: { horseId }, orderBy: { date: 'desc' } }),
      prisma.farrierVisit.findMany({ where: { horseId }, orderBy: { date: 'desc' } }),
      prisma.dentistVisit.findMany({ where: { horseId }, orderBy: { date: 'desc' } }),
      prisma.vaccinationRecord.findMany({ where: { horseId }, orderBy: { date: 'desc' } }),
      prisma.expenseNote.findMany({ where: { horseId }, orderBy: { date: 'desc' } }),
    ]);

    type TimelineEvent = {
      id: string;
      type: 'vet' | 'farrier' | 'dentist' | 'vaccination' | 'expense';
      date: string;
      title: string;
      subtitle: string | null;
      notes: string | null;
      fileUrl: string | null;
      fileName: string | null;
      extra: Record<string, string | null>;
    };

    const strip = (e: TimelineEvent): TimelineEvent =>
      isLead ? { ...e, notes: null, fileUrl: null, fileName: null } : e;

    const events: TimelineEvent[] = [
      ...vets.map((r) => {
        const dd = r.dueDate ? (r.dueDate instanceof Date ? r.dueDate.toISOString().split('T')[0] : String(r.dueDate)) : null;
        return strip({ id: r.id, type: 'vet', date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date), title: r.visitReason || 'Vet visit', subtitle: r.vetName, notes: r.notes ?? null, fileUrl: r.fileUrl ?? null, fileName: r.fileName ?? null, extra: { dueDate: dd } });
      }),
      ...farriers.map((r) => {
        const dd = r.dueDate ? (r.dueDate instanceof Date ? r.dueDate.toISOString().split('T')[0] : String(r.dueDate)) : null;
        return strip({ id: r.id, type: 'farrier', date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date), title: 'Farrier visit', subtitle: r.farrierName, notes: r.notes ?? null, fileUrl: r.fileUrl ?? null, fileName: r.fileName ?? null, extra: { dueDate: dd } });
      }),
      ...dentists.map((r) => {
        const dd = r.dueDate ? (r.dueDate instanceof Date ? r.dueDate.toISOString().split('T')[0] : String(r.dueDate)) : null;
        return strip({ id: r.id, type: 'dentist', date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date), title: 'Dentist visit', subtitle: r.dentistName, notes: r.notes ?? null, fileUrl: r.fileUrl ?? null, fileName: r.fileName ?? null, extra: { dueDate: dd } });
      }),
      ...vaccines.map((r) => strip({
        id: r.id, type: 'vaccination',
        date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date),
        title: r.name || 'Vaccination',
        subtitle: r.dueDate ? `Next due: ${r.dueDate instanceof Date ? r.dueDate.toISOString().split('T')[0] : String(r.dueDate)}` : null,
        notes: r.notes ?? null,
        fileUrl: r.fileUrl ?? null,
        fileName: r.fileName ?? null,
        extra: { dueDate: r.dueDate ? (r.dueDate instanceof Date ? r.dueDate.toISOString().split('T')[0] : String(r.dueDate)) : null },
      })),
      ...expenses.map((r) => strip({
        id: r.id, type: 'expense',
        date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date),
        title: r.category || 'Expense',
        subtitle: r.amount != null ? `£${Number(r.amount).toFixed(2)}` : null,
        notes: r.notes ?? null,
        fileUrl: r.fileUrl ?? null,
        fileName: r.fileName ?? null,
        extra: { amount: r.amount != null ? String(r.amount) : null, category: r.category ?? null },
      })),
    ];

    // Sort newest first
    events.sort((a, b) => b.date.localeCompare(a.date));

    res.json(events);
  } catch (err) {
    console.error('Timeline error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
