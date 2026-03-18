import { Router, Response } from 'express';
import { AppointmentType, AppointmentStatus } from '@prisma/client';
import { prisma } from '../db';
import { authenticate } from '../middleware/auth';
import { requireHorseAccess } from '../middleware/rbac';
import { HorsePermissionRequest } from '../types';

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────

const APPOINTMENT_SELECT = {
  id: true,
  type: true,
  typeOther: true,
  scheduledAt: true,
  practitionerName: true,
  contactNumber: true,
  locationAtStable: true,
  locationOther: true,
  notes: true,
  status: true,
  reminderSent: true,
  completedAt: true,
  createdAt: true,
  horse: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} as const;

// ─── Per-horse routes ─────────────────────────────────────────

// GET /api/appointments/horse/:horseId
router.get('/horse/:horseId', authenticate, requireHorseAccess('VIEW'), async (req: HorsePermissionRequest, res: Response) => {
  try {
    const { status } = req.query;
    const appointments = await prisma.appointment.findMany({
      where: {
        horseId: req.params.horseId,
        ...(status ? { status: status as AppointmentStatus } : {}),
      },
      orderBy: { scheduledAt: 'asc' },
      select: APPOINTMENT_SELECT,
    });
    res.json(appointments);
  } catch (err) {
    console.error('List appointments error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/appointments/horse/:horseId
router.post('/horse/:horseId', authenticate, requireHorseAccess('EDIT'), async (req: HorsePermissionRequest, res: Response) => {
  try {
    const { type, typeOther, scheduledAt, practitionerName, contactNumber, locationAtStable, locationOther, notes } = req.body;
    if (!type || !scheduledAt) {
      res.status(400).json({ error: 'Type and scheduledAt are required' });
      return;
    }
    const appointment = await prisma.appointment.create({
      data: {
        horseId: req.params.horseId,
        createdById: req.user!.userId,
        type: type as AppointmentType,
        typeOther: typeOther || null,
        scheduledAt: new Date(scheduledAt),
        practitionerName: practitionerName || null,
        contactNumber: contactNumber || null,
        locationAtStable: locationAtStable !== false,
        locationOther: locationOther || null,
        notes: notes || null,
      },
      select: APPOINTMENT_SELECT,
    });
    res.status(201).json(appointment);
  } catch (err) {
    console.error('Create appointment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/appointments/:id
router.put('/:id', authenticate, async (req: HorsePermissionRequest, res: Response) => {
  try {
    const existing = await prisma.appointment.findUnique({ where: { id: req.params.id } });
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }

    // Re-use requireHorseAccess logic: verify edit access on the horse
    const { type, typeOther, scheduledAt, practitionerName, contactNumber, locationAtStable, locationOther, notes } = req.body;
    const appointment = await prisma.appointment.update({
      where: { id: req.params.id },
      data: {
        type: type as AppointmentType,
        typeOther: typeOther || null,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        practitionerName: practitionerName || null,
        contactNumber: contactNumber || null,
        locationAtStable: locationAtStable !== false,
        locationOther: locationOther || null,
        notes: notes || null,
      },
      select: APPOINTMENT_SELECT,
    });
    res.json(appointment);
  } catch (err) {
    console.error('Update appointment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/appointments/:id/complete
// Marks appointment done and creates the corresponding health record.
router.post('/:id/complete', authenticate, async (req: HorsePermissionRequest, res: Response) => {
  try {
    const existing = await prisma.appointment.findUnique({ where: { id: req.params.id } });
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
    if (existing.status !== 'UPCOMING') {
      res.status(400).json({ error: 'Appointment is not upcoming' });
      return;
    }

    const { notes, vetName, visitReason, farrierName, dentistName, name, dueDate, amount, category } = req.body;
    const recordDate = new Date(existing.scheduledAt);
    recordDate.setHours(0, 0, 0, 0);

    // Create health record based on appointment type
    let healthRecord: unknown = null;
    if (existing.type === 'VET') {
      healthRecord = await prisma.vetVisit.create({
        data: {
          horseId: existing.horseId,
          date: recordDate,
          vetName: vetName || existing.practitionerName || null,
          visitReason: visitReason || null,
          notes: notes || null,
          dueDate: dueDate ? new Date(dueDate + 'T00:00:00Z') : null,
        },
      });
    } else if (existing.type === 'FARRIER') {
      healthRecord = await prisma.farrierVisit.create({
        data: {
          horseId: existing.horseId,
          date: recordDate,
          farrierName: farrierName || existing.practitionerName || null,
          notes: notes || null,
          dueDate: dueDate ? new Date(dueDate + 'T00:00:00Z') : null,
        },
      });
    } else if (existing.type === 'DENTIST') {
      healthRecord = await prisma.dentistVisit.create({
        data: {
          horseId: existing.horseId,
          date: recordDate,
          dentistName: dentistName || existing.practitionerName || null,
          notes: notes || null,
          dueDate: dueDate ? new Date(dueDate + 'T00:00:00Z') : null,
        },
      });
    } else if (existing.type === 'VACCINATION') {
      healthRecord = await prisma.vaccinationRecord.create({
        data: {
          horseId: existing.horseId,
          date: recordDate,
          name: name || null,
          dueDate: dueDate ? new Date(dueDate + 'T00:00:00Z') : null,
          notes: notes || null,
        },
      });
    } else if (existing.type === 'OTHER') {
      healthRecord = await prisma.expenseNote.create({
        data: {
          horseId: existing.horseId,
          date: recordDate,
          category: category || existing.typeOther || null,
          amount: amount ? parseFloat(amount) : null,
          notes: notes || null,
        },
      });
    }

    // Mark appointment completed
    const appointment = await prisma.appointment.update({
      where: { id: req.params.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
      select: APPOINTMENT_SELECT,
    });

    res.json({ appointment, healthRecord });
  } catch (err) {
    console.error('Complete appointment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/appointments/:id/cancel
router.post('/:id/cancel', authenticate, async (_req, res: Response) => {
  try {
    const appointment = await prisma.appointment.update({
      where: { id: _req.params.id },
      data: { status: 'CANCELLED' },
      select: APPOINTMENT_SELECT,
    });
    res.json(appointment);
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

// DELETE /api/appointments/:id
router.delete('/:id', authenticate, async (_req, res: Response) => {
  try {
    await prisma.appointment.delete({ where: { id: _req.params.id } });
    res.json({ message: 'Deleted' });
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

// ─── Stable-wide routes ───────────────────────────────────────

// GET /api/appointments/stable/:stableId?status=UPCOMING
router.get('/stable/:stableId', authenticate, async (req: HorsePermissionRequest, res: Response) => {
  try {
    const { status } = req.query;
    const appointments = await prisma.appointment.findMany({
      where: {
        horse: { stableId: req.params.stableId },
        ...(status ? { status: status as AppointmentStatus } : { status: 'UPCOMING' }),
      },
      orderBy: { scheduledAt: 'asc' },
      select: APPOINTMENT_SELECT,
    });
    res.json(appointments);
  } catch (err) {
    console.error('List stable appointments error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/appointments/upcoming — appointments for all horses the user can access
router.get('/upcoming', authenticate, async (req: HorsePermissionRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    let horseIds: string[];
    if (user?.role === 'ADMIN') {
      const horses = await prisma.horse.findMany({ select: { id: true } });
      horseIds = horses.map((h) => h.id);
    } else {
      const [assignments, stableAssignments] = await Promise.all([
        prisma.horseAssignment.findMany({ where: { userId }, select: { horseId: true } }),
        prisma.stableAssignment.findMany({ where: { userId }, select: { stableId: true } }),
      ]);
      const stableHorses = stableAssignments.length > 0
        ? await prisma.horse.findMany({
            where: { stableId: { in: stableAssignments.map((s) => s.stableId) } },
            select: { id: true },
          })
        : [];
      horseIds = [...new Set([
        ...assignments.map((a) => a.horseId),
        ...stableHorses.map((h) => h.id),
      ])];
    }

    const appointments = await prisma.appointment.findMany({
      where: { horseId: { in: horseIds }, status: 'UPCOMING' },
      orderBy: { scheduledAt: 'asc' },
      take: 50,
      select: APPOINTMENT_SELECT,
    });
    res.json(appointments);
  } catch (err) {
    console.error('Upcoming appointments error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
