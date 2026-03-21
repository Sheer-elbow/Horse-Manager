/**
 * Notification Scheduler
 *
 * Runs on a regular interval and dispatches email notifications to users
 * who have opted in. All notifications are off by default — users must
 * explicitly enable them on the /settings/notifications page.
 *
 * Schedule:
 *   - Health checks (vet, farrier, vaccination): daily at 08:00
 *   - Unlogged session reminder: daily at 20:00
 *   - Weekly digest: Monday at 07:00
 *
 * Uses setInterval (no external dependencies required). Checks are fired
 * every 5 minutes; the time-of-day window guards ensure each notification
 * is only sent once per day/week.
 */

import { prisma } from '../db';
import { emailAdapter } from './email';

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

// Track which hours we have already run for to prevent duplicate sends
const sentToday = new Set<string>(); // format: "YYYY-MM-DD:jobName"

function todayKey(jobName: string): string {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${date}:${jobName}`;
}

function currentHour(): number {
  return new Date().getHours();
}

function isMonday(): boolean {
  return new Date().getDay() === 1;
}

// ─── Email templates ──────────────────────────────────────────

function healthAlertEmail(items: string[]): string {
  const listItems = items.map((i) => `<li style="margin:4px 0;">${i}</li>`).join('');
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#15803d;">Stable Manager — Health Alerts</h2>
      <p>The following horses need your attention:</p>
      <ul style="padding-left:20px;">${listItems}</ul>
      <p><a href="${process.env.APP_URL ?? 'http://localhost:5173'}" style="display:inline-block;padding:10px 20px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;">Open Stable Manager</a></p>
      <p style="color:#9ca3af;font-size:12px;">You're receiving this because you enabled health alerts in Notification Settings. <a href="${process.env.APP_URL ?? 'http://localhost:5173'}/settings/notifications">Manage preferences</a></p>
    </div>
  `;
}

function unloggedSessionEmail(horses: string[]): string {
  const listItems = horses.map((h) => `<li style="margin:4px 0;">${h}</li>`).join('');
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#15803d;">Stable Manager — Sessions Unlogged Today</h2>
      <p>Today's sessions haven't been logged for:</p>
      <ul style="padding-left:20px;">${listItems}</ul>
      <p><a href="${process.env.APP_URL ?? 'http://localhost:5173'}" style="display:inline-block;padding:10px 20px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;">Log now</a></p>
      <p style="color:#9ca3af;font-size:12px;">You're receiving this because you enabled session reminders in Notification Settings. <a href="${process.env.APP_URL ?? 'http://localhost:5173'}/settings/notifications">Manage preferences</a></p>
    </div>
  `;
}

function weeklyDigestEmail(items: { horseName: string; sessions: number; weekLabel: string }[]): string {
  const rows = items.map((i) =>
    `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${i.horseName}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${i.sessions} session${i.sessions !== 1 ? 's' : ''} planned</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${i.weekLabel}</td></tr>`
  ).join('');
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#15803d;">Stable Manager — This Week's Training</h2>
      <p>Here's what's planned for your horses this week:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <thead><tr style="background:#f3f4f6;"><th style="padding:8px 12px;text-align:left;">Horse</th><th style="padding:8px 12px;text-align:left;">This week</th><th style="padding:8px 12px;text-align:left;">Programme</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p><a href="${process.env.APP_URL ?? 'http://localhost:5173'}" style="display:inline-block;padding:10px 20px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;">Open Stable Manager</a></p>
      <p style="color:#9ca3af;font-size:12px;">You're receiving this because you enabled the weekly digest in Notification Settings. <a href="${process.env.APP_URL ?? 'http://localhost:5173'}/settings/notifications">Manage preferences</a></p>
    </div>
  `;
}

// ─── Jobs ─────────────────────────────────────────────────────

async function runHealthAlerts() {
  const key = todayKey('healthAlerts');
  if (sentToday.has(key)) return;
  sentToday.add(key);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Load all users with health alerts enabled
  const users = await prisma.notificationPreference.findMany({
    where: {
      emailEnabled: true,
      OR: [
        { vaccinationReminderDays: { not: null } },
        { overdueVaccinationAlert: true },
        { vetCheckupReminderDays: { not: null } },
        { farrierReminderDays: { not: null } },
      ],
    },
    include: { user: true },
  });

  for (const pref of users) {
    const { user } = pref;
    const alerts: string[] = [];

    // Resolve accessible horse IDs
    const assignments = await prisma.horseAssignment.findMany({
      where: { userId: user.id },
      select: { horseId: true, horse: { select: { id: true, name: true } } },
    });
    const horses = assignments.map((a) => a.horse);

    for (const horse of horses) {
      // Vaccination reminders
      if (pref.vaccinationReminderDays !== null) {
        const reminderThreshold = new Date(today);
        reminderThreshold.setDate(reminderThreshold.getDate() + pref.vaccinationReminderDays);

        const upcoming = await prisma.vaccinationRecord.findMany({
          where: {
            horseId: horse.id,
            dueDate: { gte: today, lte: reminderThreshold },
          },
          select: { name: true, dueDate: true },
        });

        for (const v of upcoming) {
          const daysLeft = Math.ceil(((v.dueDate as Date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          alerts.push(`<strong>${horse.name}</strong> — ${v.name ?? 'Vaccination'} due in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`);
        }
      }

      // Overdue vaccinations
      if (pref.overdueVaccinationAlert) {
        const overdue = await prisma.vaccinationRecord.findMany({
          where: {
            horseId: horse.id,
            dueDate: { lt: today },
          },
          select: { name: true, dueDate: true },
        });

        for (const v of overdue) {
          const daysOver = Math.floor((today.getTime() - (v.dueDate as Date).getTime()) / (1000 * 60 * 60 * 24));
          alerts.push(`<strong>${horse.name}</strong> — ${v.name ?? 'Vaccination'} is ${daysOver} day${daysOver !== 1 ? 's' : ''} overdue`);
        }
      }

      // Vet check-up reminder
      if (pref.vetCheckupReminderDays !== null) {
        const cutoff = new Date(today);
        cutoff.setDate(cutoff.getDate() - pref.vetCheckupReminderDays);

        const lastVet = await prisma.vetVisit.findFirst({
          where: { horseId: horse.id },
          orderBy: { date: 'desc' },
          select: { date: true },
        });

        if (!lastVet || lastVet.date < cutoff) {
          const daysAgo = lastVet
            ? Math.floor((today.getTime() - (lastVet.date as Date).getTime()) / (1000 * 60 * 60 * 24))
            : null;
          alerts.push(
            `<strong>${horse.name}</strong> — No vet visit ${daysAgo !== null ? `in ${daysAgo} days` : 'on record'} (reminder set for every ${pref.vetCheckupReminderDays} days)`
          );
        }
      }

      // Farrier reminder
      if (pref.farrierReminderDays !== null) {
        const cutoff = new Date(today);
        cutoff.setDate(cutoff.getDate() - pref.farrierReminderDays);

        const lastFarrier = await prisma.farrierVisit.findFirst({
          where: { horseId: horse.id },
          orderBy: { date: 'desc' },
          select: { date: true },
        });

        if (!lastFarrier || lastFarrier.date < cutoff) {
          const daysAgo = lastFarrier
            ? Math.floor((today.getTime() - (lastFarrier.date as Date).getTime()) / (1000 * 60 * 60 * 24))
            : null;
          alerts.push(
            `<strong>${horse.name}</strong> — No farrier visit ${daysAgo !== null ? `in ${daysAgo} days` : 'on record'} (reminder set for every ${pref.farrierReminderDays} days)`
          );
        }
      }
    }

    if (alerts.length > 0) {
      try {
        await emailAdapter.sendMail({
          to: user.email,
          subject: `Stable Manager — ${alerts.length} health alert${alerts.length !== 1 ? 's' : ''}`,
          html: healthAlertEmail(alerts),
        });
        console.log(`Health alert email sent to ${user.email} (${alerts.length} alerts)`);
      } catch (err) {
        console.error(`Failed to send health alert to ${user.email}:`, err);
      }
    }
  }
}

async function runAppointmentReminders() {
  const key = todayKey('appointmentReminders');
  if (sentToday.has(key)) return;
  sentToday.add(key);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const users = await prisma.notificationPreference.findMany({
    where: { emailEnabled: true, appointmentReminderDays: { not: null } },
    include: { user: true },
  });

  for (const pref of users) {
    const { user } = pref;
    const reminderDays = pref.appointmentReminderDays!;
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + reminderDays + 1);

    const [assignments, stableAssignments] = await Promise.all([
      prisma.horseAssignment.findMany({ where: { userId: user.id }, select: { horseId: true } }),
      prisma.stableAssignment.findMany({ where: { userId: user.id }, select: { stableId: true } }),
    ]);
    const stableHorses = stableAssignments.length > 0
      ? await prisma.horse.findMany({
          where: { stableId: { in: stableAssignments.map((s) => s.stableId) } },
          select: { id: true },
        })
      : [];
    const horseIds = [...new Set([
      ...assignments.map((a) => a.horseId),
      ...stableHorses.map((h) => h.id),
    ])];

    if (horseIds.length === 0) continue;

    const upcoming = await prisma.appointment.findMany({
      where: {
        horseId: { in: horseIds },
        status: 'UPCOMING',
        scheduledAt: { gte: today, lt: windowEnd },
        reminderSent: false,
      },
      orderBy: { scheduledAt: 'asc' },
      include: { horse: { select: { name: true } } },
    });

    if (upcoming.length === 0) continue;

    const TYPE_LABELS: Record<string, string> = {
      VET: 'Vet', FARRIER: 'Farrier', DENTIST: 'Dentist', VACCINATION: 'Vaccination', OTHER: 'Other',
    };

    const listItems = upcoming.map((appt) => {
      const d = new Date(appt.scheduledAt);
      const daysAway = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const dateStr = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      const timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const typeLabel = appt.type === 'OTHER' ? (appt.typeOther ?? 'Other') : TYPE_LABELS[appt.type];
      const practitioner = appt.practitionerName ? ` — ${appt.practitionerName}` : '';
      return `<li style="margin:4px 0;"><strong>${appt.horse.name}</strong> · ${typeLabel}${practitioner} · ${dateStr} at ${timeStr} (in ${daysAway} day${daysAway !== 1 ? 's' : ''})</li>`;
    }).join('');

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#15803d;">Stable Manager — Upcoming Appointments</h2>
        <p>You have ${upcoming.length} appointment${upcoming.length !== 1 ? 's' : ''} coming up in the next ${reminderDays} day${reminderDays !== 1 ? 's' : ''}:</p>
        <ul style="padding-left:20px;">${listItems}</ul>
        <p><a href="${process.env.APP_URL ?? 'http://localhost:5173'}/appointments" style="display:inline-block;padding:10px 20px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;">View appointments</a></p>
        <p style="color:#9ca3af;font-size:12px;">You're receiving this because you enabled appointment reminders in Notification Settings. <a href="${process.env.APP_URL ?? 'http://localhost:5173'}/settings/notifications">Manage preferences</a></p>
      </div>
    `;

    try {
      await emailAdapter.sendMail({
        to: user.email,
        subject: `Stable Manager — ${upcoming.length} appointment${upcoming.length !== 1 ? 's' : ''} coming up`,
        html,
      });
      await prisma.appointment.updateMany({
        where: { id: { in: upcoming.map((a) => a.id) } },
        data: { reminderSent: true },
      });
      console.log(`Appointment reminder sent to ${user.email} (${upcoming.length} appointments)`);
    } catch (err) {
      console.error(`Failed to send appointment reminder to ${user.email}:`, err);
    }
  }
}

async function runUnloggedSessionReminder() {
  const key = todayKey('unloggedSessions');
  if (sentToday.has(key)) return;
  sentToday.add(key);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const users = await prisma.notificationPreference.findMany({
    where: { emailEnabled: true, unloggedSessionAlert: true },
    include: { user: true },
  });

  for (const pref of users) {
    const { user } = pref;

    const assignments = await prisma.horseAssignment.findMany({
      where: { userId: user.id },
      select: { horseId: true, horse: { select: { id: true, name: true } } },
    });
    const horseIds = assignments.map((a) => a.horseId);
    const horses = assignments.map((a) => a.horse);

    // Find today's planned workouts
    const plannedToday = await prisma.workout.findMany({
      where: {
        horseId: { in: horseIds },
        scheduledDate: { gte: today, lt: todayEnd },
        isRest: false,
        appliedPlan: { status: 'ACTIVE' },
      },
      select: { horseId: true, slot: true },
    });

    if (plannedToday.length === 0) continue;

    // Find which are logged
    const loggedToday = await prisma.actualSessionLog.findMany({
      where: {
        horseId: { in: horseIds },
        date: { gte: today, lt: todayEnd },
      },
      select: { horseId: true, slot: true },
    });

    const loggedSet = new Set(loggedToday.map((l) => `${l.horseId}:${l.slot}`));

    const unloggedHorseNames = [
      ...new Set(
        plannedToday
          .filter((w) => !loggedSet.has(`${w.horseId}:${w.slot}`))
          .map((w) => horses.find((h) => h.id === w.horseId)?.name ?? 'Unknown')
      ),
    ];

    if (unloggedHorseNames.length > 0) {
      try {
        await emailAdapter.sendMail({
          to: user.email,
          subject: `Stable Manager — ${unloggedHorseNames.length} session${unloggedHorseNames.length !== 1 ? 's' : ''} unlogged today`,
          html: unloggedSessionEmail(unloggedHorseNames),
        });
        console.log(`Unlogged session reminder sent to ${user.email}`);
      } catch (err) {
        console.error(`Failed to send session reminder to ${user.email}:`, err);
      }
    }
  }
}

async function runWeeklyDigest() {
  const key = todayKey('weeklyDigest');
  if (sentToday.has(key)) return;
  sentToday.add(key);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const users = await prisma.notificationPreference.findMany({
    where: { emailEnabled: true, weeklyDigest: true },
    include: { user: true },
  });

  for (const pref of users) {
    const { user } = pref;

    const assignments = await prisma.horseAssignment.findMany({
      where: { userId: user.id },
      select: { horseId: true, horse: { select: { id: true, name: true } } },
    });

    const items: { horseName: string; sessions: number; weekLabel: string }[] = [];

    for (const { horse } of assignments) {
      const workouts = await prisma.workout.findMany({
        where: {
          horseId: horse.id,
          scheduledDate: { gte: today, lt: weekEnd },
          isRest: false,
          appliedPlan: { status: 'ACTIVE' },
        },
        include: {
          appliedPlan: {
            select: { programmeVersion: { select: { programme: { select: { name: true } } } } },
          },
        },
      });

      if (workouts.length > 0) {
        const programmeName = workouts[0].appliedPlan?.programmeVersion?.programme?.name ?? 'Training';
        items.push({ horseName: horse.name, sessions: workouts.length, weekLabel: programmeName });
      }
    }

    if (items.length > 0) {
      try {
        await emailAdapter.sendMail({
          to: user.email,
          subject: 'Stable Manager — Your Week Ahead',
          html: weeklyDigestEmail(items),
        });
        console.log(`Weekly digest sent to ${user.email}`);
      } catch (err) {
        console.error(`Failed to send weekly digest to ${user.email}:`, err);
      }
    }
  }
}

// ─── Scheduler entry point ────────────────────────────────────

export function startNotificationScheduler(): void {
  console.log('Notification scheduler started');

  // Clean up the "sent today" set at midnight
  const clearAtMidnight = () => {
    const now = new Date();
    const msUntilMidnight =
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
    setTimeout(() => {
      sentToday.clear();
      clearAtMidnight(); // reschedule for next midnight
    }, msUntilMidnight);
  };
  clearAtMidnight();

  setInterval(async () => {
    const hour = currentHour();

    // 08:00 — health alerts + appointment reminders
    if (hour === 8) {
      await runHealthAlerts().catch((err) => console.error('Health alert job error:', err));
      await runAppointmentReminders().catch((err) => console.error('Appointment reminder job error:', err));
    }

    // 20:00 — unlogged session reminder
    if (hour === 20) {
      await runUnloggedSessionReminder().catch((err) => console.error('Unlogged session job error:', err));
    }

    // Monday 07:00 — weekly digest
    if (hour === 7 && isMonday()) {
      await runWeeklyDigest().catch((err) => console.error('Weekly digest job error:', err));
    }
  }, CHECK_INTERVAL_MS);
}
