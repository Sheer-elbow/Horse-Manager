import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { authenticate } from '../middleware/auth';
import { requireHorseAccess } from '../middleware/rbac';
import { HorsePermissionRequest } from '../types';

const router = Router();

// Generic date+notes schema
const recordSchema = z.object({
  date: z.string(),
  notes: z.string().nullable().optional(),
});

const vaccinationSchema = recordSchema.extend({
  name: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

const expenseSchema = recordSchema.extend({
  amount: z.number().positive().nullable().optional(),
});

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
    const data = recordSchema.parse(req.body);
    const visit = await prisma.vetVisit.create({
      data: { horseId: req.params.horseId, date: new Date(data.date + 'T00:00:00Z'), notes: data.notes ?? null },
    });
    res.status(201).json(visit);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Invalid input', details: err.errors }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:horseId/vet-visits/:recordId', authenticate, requireHorseAccess('EDIT'), async (req, res: Response) => {
  try {
    const data = recordSchema.parse(req.body);
    const visit = await prisma.vetVisit.update({
      where: { id: req.params.recordId },
      data: { date: new Date(data.date + 'T00:00:00Z'), notes: data.notes ?? null },
    });
    res.json(visit);
  } catch { res.status(404).json({ error: 'Not found' }); }
});

router.delete('/:horseId/vet-visits/:recordId', authenticate, requireHorseAccess('EDIT'), async (req, res: Response) => {
  try {
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
    const data = recordSchema.parse(req.body);
    const visit = await prisma.farrierVisit.create({
      data: { horseId: req.params.horseId, date: new Date(data.date + 'T00:00:00Z'), notes: data.notes ?? null },
    });
    res.status(201).json(visit);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Invalid input', details: err.errors }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:horseId/farrier-visits/:recordId', authenticate, requireHorseAccess('EDIT'), async (req, res: Response) => {
  try {
    const data = recordSchema.parse(req.body);
    const visit = await prisma.farrierVisit.update({
      where: { id: req.params.recordId },
      data: { date: new Date(data.date + 'T00:00:00Z'), notes: data.notes ?? null },
    });
    res.json(visit);
  } catch { res.status(404).json({ error: 'Not found' }); }
});

router.delete('/:horseId/farrier-visits/:recordId', authenticate, requireHorseAccess('EDIT'), async (req, res: Response) => {
  try {
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
    const data = vaccinationSchema.parse(req.body);
    const record = await prisma.vaccinationRecord.create({
      data: {
        horseId: req.params.horseId,
        name: data.name ?? null,
        date: new Date(data.date + 'T00:00:00Z'),
        notes: data.notes ?? null,
        dueDate: data.dueDate ? new Date(data.dueDate + 'T00:00:00Z') : null,
      },
    });
    res.status(201).json(record);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Invalid input', details: err.errors }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:horseId/vaccinations/:recordId', authenticate, requireHorseAccess('EDIT'), async (req, res: Response) => {
  try {
    const data = vaccinationSchema.parse(req.body);
    const record = await prisma.vaccinationRecord.update({
      where: { id: req.params.recordId },
      data: {
        name: data.name ?? null,
        date: new Date(data.date + 'T00:00:00Z'),
        notes: data.notes ?? null,
        dueDate: data.dueDate ? new Date(data.dueDate + 'T00:00:00Z') : null,
      },
    });
    res.json(record);
  } catch { res.status(404).json({ error: 'Not found' }); }
});

router.delete('/:horseId/vaccinations/:recordId', authenticate, requireHorseAccess('EDIT'), async (req, res: Response) => {
  try {
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
    const data = expenseSchema.parse(req.body);
    const expense = await prisma.expenseNote.create({
      data: {
        horseId: req.params.horseId,
        date: new Date(data.date + 'T00:00:00Z'),
        amount: data.amount ?? null,
        notes: data.notes ?? null,
      },
    });
    res.status(201).json(expense);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Invalid input', details: err.errors }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:horseId/expenses/:recordId', authenticate, requireHorseAccess('EDIT'), async (req, res: Response) => {
  try {
    const data = expenseSchema.parse(req.body);
    const expense = await prisma.expenseNote.update({
      where: { id: req.params.recordId },
      data: { date: new Date(data.date + 'T00:00:00Z'), amount: data.amount ?? null, notes: data.notes ?? null },
    });
    res.json(expense);
  } catch { res.status(404).json({ error: 'Not found' }); }
});

router.delete('/:horseId/expenses/:recordId', authenticate, requireHorseAccess('EDIT'), async (req, res: Response) => {
  try {
    await prisma.expenseNote.delete({ where: { id: req.params.recordId } });
    res.json({ message: 'Deleted' });
  } catch { res.status(404).json({ error: 'Not found' }); }
});

export default router;
