/**
 * Shared types and helpers for projecting Workout currentData
 * into PlannedSession-compatible flat fields.
 *
 * Used by both applied-plans (on apply) and workouts (on edit/reset)
 * to keep the two models in sync.
 */

export interface ScheduleBlock {
  name: string;
  text: string;
}

export interface ScheduleDayEntry {
  week: number;
  day: number;
  title: string;
  category: string;
  durationMin: number | null;
  durationMax: number | null;
  intensityLabel: string | null;
  intensityRpeMin: number | null;
  intensityRpeMax: number | null;
  blocks: ScheduleBlock[];
  substitution: string | null;
  manualRef: string | null;
}

const REST_CATEGORIES = ['rest', 'recovery'];

export function isRestDay(entry: ScheduleDayEntry): boolean {
  return REST_CATEGORIES.includes(entry.category.toLowerCase()) || entry.title.toLowerCase() === 'rest';
}

/**
 * Build a minimal rest-day ScheduleDayEntry for a given week/day position.
 */
export function makeRestEntry(week: number, day: number): ScheduleDayEntry {
  return {
    week,
    day,
    title: 'Rest',
    category: 'rest',
    durationMin: null,
    durationMax: null,
    intensityLabel: null,
    intensityRpeMin: null,
    intensityRpeMax: null,
    blocks: [],
    substitution: null,
    manualRef: null,
  };
}

/**
 * Deterministic mapping from workout schedule data to PlannedSession fields.
 * This ensures Workout → PlannedSession projection is always consistent.
 */
export function projectToSessionFields(entry: ScheduleDayEntry) {
  const blockTexts = entry.blocks.map(b => `[${b.name}] ${b.text}`).join('\n');
  return {
    sessionType: entry.title,
    description: blockTexts || null,
    durationMinutes: entry.durationMin,
    intensityRpe: entry.intensityRpeMin,
    notes: entry.substitution ? `Substitution: ${entry.substitution}` : null,
  };
}
