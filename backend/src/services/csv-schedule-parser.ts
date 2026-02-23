/**
 * Parses a schedule.csv file into structured ScheduleDay[] data.
 *
 * Required CSV columns (case-insensitive, trimmed):
 *   week, day, title, category
 *
 * Optional CSV columns:
 *   duration_min, duration_max, intensity_label, intensity_rpe_min, intensity_rpe_max,
 *   blocks, substitution, manual_ref
 *
 * "blocks" column format: pipe-separated "Name: text" entries.
 *   e.g. "Warm-up: 15 min walk | Main: 3x5 min canter | Cool-down: 10 min walk"
 *   If omitted, a single "Main" block is created from the title.
 */

export interface ScheduleBlock {
  name: string;
  text: string;
}

export interface ScheduleDay {
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

export interface ParseResult {
  scheduleData: ScheduleDay[];
  numWeeks: number;
  errors: string[];
}

const REQUIRED_COLUMNS = ['week', 'day', 'title', 'category'];

const KNOWN_COLUMNS = [
  'week', 'day', 'title', 'category',
  'duration_min', 'duration_max',
  'intensity_label', 'intensity_rpe_min', 'intensity_rpe_max',
  'blocks', 'substitution', 'manual_ref',
];

const REST_CATEGORIES = ['rest', 'recovery'];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseBlocks(raw: string, title: string, isRest: boolean): ScheduleBlock[] {
  if (!raw) {
    // Default block for entries without explicit blocks
    if (isRest) {
      return [{ name: 'Rest', text: title }];
    }
    return [{ name: 'Main', text: title }];
  }

  const parts = raw.split('|').map(p => p.trim()).filter(Boolean);
  const blocks: ScheduleBlock[] = [];

  for (const part of parts) {
    const colonIdx = part.indexOf(':');
    if (colonIdx > 0) {
      blocks.push({
        name: part.slice(0, colonIdx).trim(),
        text: part.slice(colonIdx + 1).trim(),
      });
    } else {
      blocks.push({ name: 'Main', text: part });
    }
  }

  return blocks.length > 0 ? blocks : [{ name: 'Main', text: title }];
}

function parseOptionalInt(val: string | undefined): number | null {
  if (!val || val === '') return null;
  const n = parseInt(val, 10);
  if (isNaN(n)) return null;
  return n;
}

export function parseScheduleCsv(csvContent: string): ParseResult {
  const errors: string[] = [];

  // Split lines, handling \r\n and \n
  const lines = csvContent.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) {
    return { scheduleData: [], numWeeks: 0, errors: ['CSV must have a header row and at least one data row'] };
  }

  // Parse header
  const headers = parseCsvLine(lines[0]).map(normalizeHeader);

  // Check required columns
  for (const col of REQUIRED_COLUMNS) {
    if (!headers.includes(col)) {
      errors.push(`Missing required column: "${col}"`);
    }
  }
  if (errors.length > 0) {
    return { scheduleData: [], numWeeks: 0, errors };
  }

  // Warn about unknown columns (non-fatal)
  for (const h of headers) {
    if (!KNOWN_COLUMNS.includes(h)) {
      errors.push(`Warning: unknown column "${h}" will be ignored`);
    }
  }

  // Build column index map
  const colIdx = (name: string) => headers.indexOf(name);

  const scheduleData: ScheduleDay[] = [];

  for (let i = 1; i < lines.length; i++) {
    const lineNum = i + 1;
    const fields = parseCsvLine(lines[i]);

    // Skip empty rows
    if (fields.every(f => f === '')) continue;

    const weekStr = fields[colIdx('week')] ?? '';
    const dayStr = fields[colIdx('day')] ?? '';
    const title = fields[colIdx('title')] ?? '';
    const category = fields[colIdx('category')] ?? '';

    // Validate week
    const week = parseInt(weekStr, 10);
    if (isNaN(week) || week < 1) {
      errors.push(`Row ${lineNum}: "week" must be a positive integer, got "${weekStr}"`);
      continue;
    }

    // Validate day
    const day = parseInt(dayStr, 10);
    if (isNaN(day) || day < 1 || day > 7) {
      errors.push(`Row ${lineNum}: "day" must be 1-7, got "${dayStr}"`);
      continue;
    }

    // Validate title
    if (!title) {
      errors.push(`Row ${lineNum}: "title" cannot be empty`);
      continue;
    }

    // Validate category
    if (!category) {
      errors.push(`Row ${lineNum}: "category" cannot be empty`);
      continue;
    }

    const isRest = REST_CATEGORIES.includes(category.toLowerCase()) || title.toLowerCase() === 'rest';

    const durationMin = parseOptionalInt(fields[colIdx('duration_min')]);
    const durationMax = parseOptionalInt(fields[colIdx('duration_max')]);
    const intensityLabel = fields[colIdx('intensity_label')]?.trim() || null;
    const intensityRpeMin = parseOptionalInt(fields[colIdx('intensity_rpe_min')]);
    const intensityRpeMax = parseOptionalInt(fields[colIdx('intensity_rpe_max')]);
    const blocksRaw = fields[colIdx('blocks')] ?? '';
    const substitution = fields[colIdx('substitution')]?.trim() || null;
    const manualRef = fields[colIdx('manual_ref')]?.trim() || null;

    // Validate RPE range
    if (intensityRpeMin !== null && (intensityRpeMin < 1 || intensityRpeMin > 10)) {
      errors.push(`Row ${lineNum}: "intensity_rpe_min" must be 1-10, got ${intensityRpeMin}`);
    }
    if (intensityRpeMax !== null && (intensityRpeMax < 1 || intensityRpeMax > 10)) {
      errors.push(`Row ${lineNum}: "intensity_rpe_max" must be 1-10, got ${intensityRpeMax}`);
    }

    scheduleData.push({
      week,
      day,
      title,
      category: category.toLowerCase(),
      durationMin,
      durationMax,
      intensityLabel,
      intensityRpeMin,
      intensityRpeMax,
      blocks: parseBlocks(blocksRaw, title, isRest),
      substitution,
      manualRef,
    });
  }

  // Filter out warning-only errors for the fatal check
  const fatalErrors = errors.filter(e => !e.startsWith('Warning:'));
  if (fatalErrors.length > 0) {
    return { scheduleData: [], numWeeks: 0, errors };
  }

  // Sort by week, then day
  scheduleData.sort((a, b) => a.week - b.week || a.day - b.day);

  // Determine numWeeks
  const maxWeek = Math.max(...scheduleData.map(d => d.week));

  // Validate: each week must have exactly 7 days
  for (let w = 1; w <= maxWeek; w++) {
    const weekDays = scheduleData.filter(d => d.week === w);
    if (weekDays.length !== 7) {
      errors.push(`Week ${w}: must have exactly 7 day entries (got ${weekDays.length}). Include rest days explicitly.`);
    } else {
      // Check days 1-7 all present
      const dayNums = weekDays.map(d => d.day).sort();
      const expected = [1, 2, 3, 4, 5, 6, 7];
      if (JSON.stringify(dayNums) !== JSON.stringify(expected)) {
        errors.push(`Week ${w}: days must be 1-7, got [${dayNums.join(', ')}]`);
      }
    }
  }

  // Check for duplicate week+day
  const seen = new Set<string>();
  for (const d of scheduleData) {
    const key = `${d.week}-${d.day}`;
    if (seen.has(key)) {
      errors.push(`Duplicate entry for week ${d.week}, day ${d.day}`);
    }
    seen.add(key);
  }

  const fatalAfterStructure = errors.filter(e => !e.startsWith('Warning:'));
  if (fatalAfterStructure.length > 0) {
    return { scheduleData: [], numWeeks: 0, errors };
  }

  return { scheduleData, numWeeks: maxWeek, errors };
}
