import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

const preferencesSchema = z.object({
  emailEnabled: z.boolean(),
  vaccinationReminderDays: z.number().int().positive().nullable(),
  overdueVaccinationAlert: z.boolean(),
  vetCheckupReminderDays: z.number().int().positive().nullable(),
  farrierReminderDays: z.number().int().positive().nullable(),
  unloggedSessionAlert: z.boolean(),
  weeklyDigest: z.boolean(),
});

// GET /api/notifications/preferences
// Returns the current user's notification preferences (or defaults if not yet set)
router.get('/preferences', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const prefs = await prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!prefs) {
      // Return safe defaults — everything off
      res.json({
        emailEnabled: false,
        vaccinationReminderDays: null,
        overdueVaccinationAlert: false,
        vetCheckupReminderDays: null,
        farrierReminderDays: null,
        unloggedSessionAlert: false,
        weeklyDigest: false,
      });
      return;
    }

    res.json({
      emailEnabled: prefs.emailEnabled,
      vaccinationReminderDays: prefs.vaccinationReminderDays,
      overdueVaccinationAlert: prefs.overdueVaccinationAlert,
      vetCheckupReminderDays: prefs.vetCheckupReminderDays,
      farrierReminderDays: prefs.farrierReminderDays,
      unloggedSessionAlert: prefs.unloggedSessionAlert,
      weeklyDigest: prefs.weeklyDigest,
    });
  } catch (err) {
    console.error('Get notification preferences error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/notifications/preferences
// Upsert the current user's notification preferences
router.put('/preferences', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const parsed = preferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid preferences', details: parsed.error.issues });
      return;
    }

    const data = parsed.data;

    const prefs = await prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    res.json({
      emailEnabled: prefs.emailEnabled,
      vaccinationReminderDays: prefs.vaccinationReminderDays,
      overdueVaccinationAlert: prefs.overdueVaccinationAlert,
      vetCheckupReminderDays: prefs.vetCheckupReminderDays,
      farrierReminderDays: prefs.farrierReminderDays,
      unloggedSessionAlert: prefs.unloggedSessionAlert,
      weeklyDigest: prefs.weeklyDigest,
    });
  } catch (err) {
    console.error('Update notification preferences error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
