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

/** Common header aliases → canonical name */
const HEADER_ALIASES: Record<string, string> = {
  session: 'title',
  session_title: 'title',
  workout: 'title',
  workout_title: 'title',
  exercise: 'title',
  name: 'title',
  activity: 'title',
  activity_name: 'title',
  description: 'title',
  session_name: 'title',
  task: 'title',
  type: 'category',
  session_type: 'category',
  workout_type: 'category',
  activity_type: 'category',
  cat: 'category',
  discipline: 'category',
  week_number: 'week',
  week_no: 'week',
  wk: 'week',
  day_number: 'day',
  day_no: 'day',
  day_of_week: 'day',
  dow: 'day',
  duration: 'duration_min',
  time: 'duration_min',
  time_min: 'duration_min',
  minutes: 'duration_min',
  min_duration: 'duration_min',
  max_duration: 'duration_max',
  rpe_min: 'intensity_rpe_min',
  rpe_max: 'intensity_rpe_max',
  rpe: 'intensity_rpe_min',
  intensity: 'intensity_label',
  effort: 'intensity_label',
  sub: 'substitution',
  alternative: 'substitution',
  alt: 'substitution',
  swap: 'substitution',
  ref: 'manual_ref',
  manual_reference: 'manual_ref',
  page: 'manual_ref',
  reference: 'manual_ref',
  exercises: 'blocks',
  steps: 'blocks',
  detail: 'blocks',
  details: 'blocks',
  notes: 'blocks',
};

const REST_CATEGORIES = ['rest', 'recovery'];

function normalizeHeader(h: string): string {
  let norm = h.trim().toLowerCase();
  // Strip trailing #, e.g. "Week #" → "week"
  norm = norm.replace(/\s*#$/, '');
  // Strip parenthetical content, e.g. "Duration (min)" → "duration"
  norm = norm.replace(/\s*\([^)]*\)/, '');
  // Replace spaces, hyphens, multiple underscores with single _
  norm = norm.replace(/[\s-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  // Apply alias mapping
  return HEADER_ALIASES[norm] ?? norm;
}

/** Detect whether the header uses tabs, semicolons (European Excel), or commas */
function detectDelimiter(headerLine: string): string {
  // Count unquoted delimiters
  let inQuotes = false;
  let commas = 0;
  let semis = 0;
  let tabs = 0;
  for (const ch of headerLine) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (inQuotes) continue;
    if (ch === ',') commas++;
    if (ch === ';') semis++;
    if (ch === '\t') tabs++;
  }
  // Tab-delimited wins if any tabs are present (common Excel copy-paste)
  if (tabs > 0 && tabs >= commas && tabs >= semis) return '\t';
  return semis > commas ? ';' : ',';
}

function parseCsvLine(line: string, delimiter = ','): string[] {
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
      } else if (ch === delimiter) {
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

/** Extract a number from strings like "Week 3", "Day 2", "3", "#3", "W3" */
function extractInt(val: string): number {
  // Strip common prefixes: "Week", "Day", "W", "D", "#"
  const cleaned = val.replace(/^(week|day|wk|w|d|#)\s*/i, '').trim();
  return parseInt(cleaned, 10);
}

function parseOptionalInt(val: string | undefined): number | null {
  if (!val || val === '') return null;
  const n = parseInt(val, 10);
  if (isNaN(n)) return null;
  return n;
}

/** Map day names to numbers */
const DAY_NAME_MAP: Record<string, number> = {
  mon: 1, monday: 1,
  tue: 2, tuesday: 2, tues: 2,
  wed: 3, wednesday: 3, weds: 3,
  thu: 4, thursday: 4, thur: 4, thurs: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
  sun: 7, sunday: 7,
};

function parseDay(val: string): number {
  const lower = val.trim().toLowerCase();
  // Try day name first
  if (DAY_NAME_MAP[lower] !== undefined) return DAY_NAME_MAP[lower];
  // Try numeric extraction
  return extractInt(val);
}

export function parseScheduleCsv(csvContent: string): ParseResult {
  const errors: string[] = [];

  // Strip UTF-8 BOM (common in Excel exports)
  const cleaned = csvContent.replace(/^\uFEFF/, '');

  // Split lines, handling \r\n and \n
  const lines = cleaned.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) {
    return { scheduleData: [], numWeeks: 0, errors: ['CSV must have a header row and at least one data row'] };
  }

  // Auto-detect delimiter (comma vs semicolon)
  const delimiter = detectDelimiter(lines[0]);

  // Parse header
  const headers = parseCsvLine(lines[0], delimiter).map(normalizeHeader);

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
    const fields = parseCsvLine(lines[i], delimiter);

    // Skip empty rows
    if (fields.every(f => f === '')) continue;

    const weekStr = fields[colIdx('week')] ?? '';
    const dayStr = fields[colIdx('day')] ?? '';
    const title = fields[colIdx('title')] ?? '';
    const category = fields[colIdx('category')] ?? '';

    // Validate week (accept "Week 1", "W1", "#1", "1", etc.)
    const week = extractInt(weekStr);
    if (isNaN(week) || week < 1) {
      errors.push(`Row ${lineNum}: "week" must be a positive integer, got "${weekStr}"`);
      continue;
    }

    // Validate day (accept "Monday", "Mon", "Day 1", "D1", "1", etc.)
    const day = parseDay(dayStr);
    if (isNaN(day) || day < 1 || day > 7) {
      errors.push(`Row ${lineNum}: "day" must be 1-7 (or a day name like Mon/Tuesday), got "${dayStr}"`);
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

  // Check for duplicate week+day
  const seen = new Set<string>();
  for (const d of scheduleData) {
    const key = `${d.week}-${d.day}`;
    if (seen.has(key)) {
      errors.push(`Duplicate entry for week ${d.week}, day ${d.day}`);
    }
    seen.add(key);
  }

  const fatalAfterDupes = errors.filter(e => !e.startsWith('Warning:'));
  if (fatalAfterDupes.length > 0) {
    return { scheduleData: [], numWeeks: 0, errors };
  }

  // Determine numWeeks
  const maxWeek = Math.max(...scheduleData.map(d => d.week));

  // Auto-fill missing days in each week as rest days (trainers often omit them)
  for (let w = 1; w <= maxWeek; w++) {
    const existingDays = new Set(scheduleData.filter(d => d.week === w).map(d => d.day));
    for (let d = 1; d <= 7; d++) {
      if (!existingDays.has(d)) {
        scheduleData.push({
          week: w,
          day: d,
          title: 'Rest',
          category: 'rest',
          durationMin: null,
          durationMax: null,
          intensityLabel: null,
          intensityRpeMin: null,
          intensityRpeMax: null,
          blocks: [{ name: 'Rest', text: 'Rest' }],
          substitution: null,
          manualRef: null,
        });
      }
    }
  }

  // Sort by week, then day
  scheduleData.sort((a, b) => a.week - b.week || a.day - b.day);

  return { scheduleData, numWeeks: maxWeek, errors };
}
