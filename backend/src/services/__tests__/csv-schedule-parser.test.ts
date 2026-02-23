import { describe, it, expect } from 'vitest';
import { parseScheduleCsv } from '../csv-schedule-parser';

// ─── Helper: build a valid 1-week CSV with 7 days ─────────

function makeWeekCsv(overrides: Partial<Record<string, string>>[] = []): string {
  const header = 'week,day,title,category,duration_min,duration_max,intensity_label,intensity_rpe_min,intensity_rpe_max,blocks,substitution,manual_ref';
  const defaultRows = [
    { week: '1', day: '1', title: 'Flat work', category: 'training', duration_min: '30', duration_max: '45', intensity_label: 'Moderate', intensity_rpe_min: '5', intensity_rpe_max: '7', blocks: 'Warm-up: 10 min walk | Main: 20 min trot | Cool-down: 5 min walk', substitution: '', manual_ref: 'p.12' },
    { week: '1', day: '2', title: 'Jumping', category: 'training', duration_min: '40', duration_max: '50', intensity_label: 'Hard', intensity_rpe_min: '7', intensity_rpe_max: '9', blocks: '', substitution: 'Pole work if ground is wet', manual_ref: '' },
    { week: '1', day: '3', title: 'Rest', category: 'rest', duration_min: '', duration_max: '', intensity_label: '', intensity_rpe_min: '', intensity_rpe_max: '', blocks: '', substitution: '', manual_ref: '' },
    { week: '1', day: '4', title: 'Hack', category: 'training', duration_min: '60', duration_max: '', intensity_label: 'Light', intensity_rpe_min: '3', intensity_rpe_max: '4', blocks: '', substitution: '', manual_ref: '' },
    { week: '1', day: '5', title: 'Lunging', category: 'training', duration_min: '20', duration_max: '25', intensity_label: '', intensity_rpe_min: '5', intensity_rpe_max: '6', blocks: '', substitution: '', manual_ref: '' },
    { week: '1', day: '6', title: 'Polo practice', category: 'training', duration_min: '45', duration_max: '60', intensity_label: 'Hard', intensity_rpe_min: '8', intensity_rpe_max: '9', blocks: 'Warm-up: stick & ball | Match: 2 chukkas', substitution: '', manual_ref: 'p.20' },
    { week: '1', day: '7', title: 'Recovery walk', category: 'recovery', duration_min: '15', duration_max: '', intensity_label: 'Light', intensity_rpe_min: '2', intensity_rpe_max: '3', blocks: '', substitution: '', manual_ref: '' },
  ];

  const rows = defaultRows.map((row, i) => {
    const merged = { ...row, ...overrides[i] };
    return `${merged.week},${merged.day},${merged.title},${merged.category},${merged.duration_min},${merged.duration_max},${merged.intensity_label},${merged.intensity_rpe_min},${merged.intensity_rpe_max},${merged.blocks},${merged.substitution},${merged.manual_ref}`;
  });

  return [header, ...rows].join('\n');
}

// ─── Valid CSV tests ─────────────────────────────────────

describe('parseScheduleCsv', () => {
  describe('valid input', () => {
    it('parses a valid 1-week CSV with all columns', () => {
      const csv = makeWeekCsv();
      const result = parseScheduleCsv(csv);

      expect(result.errors.filter(e => !e.startsWith('Warning:'))).toEqual([]);
      expect(result.numWeeks).toBe(1);
      expect(result.scheduleData).toHaveLength(7);
    });

    it('returns correct fields for a training day', () => {
      const csv = makeWeekCsv();
      const result = parseScheduleCsv(csv);
      const day1 = result.scheduleData.find(d => d.day === 1)!;

      expect(day1.week).toBe(1);
      expect(day1.title).toBe('Flat work');
      expect(day1.category).toBe('training');
      expect(day1.durationMin).toBe(30);
      expect(day1.durationMax).toBe(45);
      expect(day1.intensityLabel).toBe('Moderate');
      expect(day1.intensityRpeMin).toBe(5);
      expect(day1.intensityRpeMax).toBe(7);
      expect(day1.manualRef).toBe('p.12');
    });

    it('parses blocks correctly (pipe-separated)', () => {
      const csv = makeWeekCsv();
      const result = parseScheduleCsv(csv);
      const day1 = result.scheduleData.find(d => d.day === 1)!;

      expect(day1.blocks).toHaveLength(3);
      expect(day1.blocks[0]).toEqual({ name: 'Warm-up', text: '10 min walk' });
      expect(day1.blocks[1]).toEqual({ name: 'Main', text: '20 min trot' });
      expect(day1.blocks[2]).toEqual({ name: 'Cool-down', text: '5 min walk' });
    });

    it('creates default block when blocks column is empty', () => {
      const csv = makeWeekCsv();
      const result = parseScheduleCsv(csv);
      const day2 = result.scheduleData.find(d => d.day === 2)!;

      expect(day2.blocks).toHaveLength(1);
      expect(day2.blocks[0]).toEqual({ name: 'Main', text: 'Jumping' });
    });

    it('creates Rest block for rest days without explicit blocks', () => {
      const csv = makeWeekCsv();
      const result = parseScheduleCsv(csv);
      const day3 = result.scheduleData.find(d => d.day === 3)!;

      expect(day3.blocks).toHaveLength(1);
      expect(day3.blocks[0]).toEqual({ name: 'Rest', text: 'Rest' });
    });

    it('handles null fields for optional columns', () => {
      const csv = makeWeekCsv();
      const result = parseScheduleCsv(csv);
      const day3 = result.scheduleData.find(d => d.day === 3)!;

      expect(day3.durationMin).toBeNull();
      expect(day3.durationMax).toBeNull();
      expect(day3.intensityLabel).toBeNull();
      expect(day3.intensityRpeMin).toBeNull();
      expect(day3.intensityRpeMax).toBeNull();
      expect(day3.substitution).toBeNull();
      expect(day3.manualRef).toBeNull();
    });

    it('captures substitution text', () => {
      const csv = makeWeekCsv();
      const result = parseScheduleCsv(csv);
      const day2 = result.scheduleData.find(d => d.day === 2)!;

      expect(day2.substitution).toBe('Pole work if ground is wet');
    });

    it('sorts output by week then day', () => {
      const csv = makeWeekCsv();
      const result = parseScheduleCsv(csv);

      for (let i = 0; i < result.scheduleData.length - 1; i++) {
        const a = result.scheduleData[i];
        const b = result.scheduleData[i + 1];
        expect(a.week * 10 + a.day).toBeLessThanOrEqual(b.week * 10 + b.day);
      }
    });

    it('handles \\r\\n line endings', () => {
      const csv = makeWeekCsv().replace(/\n/g, '\r\n');
      const result = parseScheduleCsv(csv);
      expect(result.errors.filter(e => !e.startsWith('Warning:'))).toEqual([]);
      expect(result.scheduleData).toHaveLength(7);
    });

    it('handles quoted CSV fields with commas inside', () => {
      const header = 'week,day,title,category';
      const rows = Array.from({ length: 7 }, (_, i) =>
        i === 0
          ? `1,${i + 1},"Flat work, extended",training`
          : `1,${i + 1},Rest,rest`
      );
      const csv = [header, ...rows].join('\n');
      const result = parseScheduleCsv(csv);
      expect(result.errors.filter(e => !e.startsWith('Warning:'))).toEqual([]);
      expect(result.scheduleData[0].title).toBe('Flat work, extended');
    });

    it('handles quoted CSV fields with escaped quotes', () => {
      const header = 'week,day,title,category';
      const rows = Array.from({ length: 7 }, (_, i) =>
        i === 0
          ? `1,${i + 1},"Flat ""advanced"" work",training`
          : `1,${i + 1},Rest,rest`
      );
      const csv = [header, ...rows].join('\n');
      const result = parseScheduleCsv(csv);
      expect(result.errors.filter(e => !e.startsWith('Warning:'))).toEqual([]);
      expect(result.scheduleData[0].title).toBe('Flat "advanced" work');
    });

    it('parses multi-week CSV', () => {
      const header = 'week,day,title,category';
      const rows: string[] = [];
      for (let w = 1; w <= 3; w++) {
        for (let d = 1; d <= 7; d++) {
          rows.push(`${w},${d},${d === 7 ? 'Rest' : 'Training'},${d === 7 ? 'rest' : 'training'}`);
        }
      }
      const csv = [header, ...rows].join('\n');
      const result = parseScheduleCsv(csv);
      expect(result.errors.filter(e => !e.startsWith('Warning:'))).toEqual([]);
      expect(result.numWeeks).toBe(3);
      expect(result.scheduleData).toHaveLength(21);
    });

    it('accepts case-insensitive headers', () => {
      const header = 'Week,Day,Title,Category,Duration_Min';
      const rows = Array.from({ length: 7 }, (_, i) =>
        `1,${i + 1},${i === 6 ? 'Rest' : 'Training'},${i === 6 ? 'rest' : 'training'},30`
      );
      const csv = [header, ...rows].join('\n');
      const result = parseScheduleCsv(csv);
      expect(result.errors.filter(e => !e.startsWith('Warning:'))).toEqual([]);
      expect(result.scheduleData[0].durationMin).toBe(30);
    });
  });

  // ─── Error cases ─────────────────────────────────────────

  describe('error handling', () => {
    it('rejects empty CSV', () => {
      const result = parseScheduleCsv('');
      expect(result.errors).toContain('CSV must have a header row and at least one data row');
      expect(result.scheduleData).toEqual([]);
    });

    it('rejects header-only CSV', () => {
      const result = parseScheduleCsv('week,day,title,category');
      expect(result.errors).toContain('CSV must have a header row and at least one data row');
    });

    it('rejects CSV missing required columns', () => {
      const csv = 'week,day,title\n1,1,Test';
      const result = parseScheduleCsv(csv);
      expect(result.errors).toContain('Missing required column: "category"');
      expect(result.scheduleData).toEqual([]);
    });

    it('rejects invalid week value', () => {
      const header = 'week,day,title,category';
      const rows = [
        'abc,1,Training,training',
        ...Array.from({ length: 6 }, (_, i) => `1,${i + 2},Rest,rest`),
      ];
      const csv = [header, ...rows].join('\n');
      const result = parseScheduleCsv(csv);
      expect(result.errors.some(e => e.includes('"week" must be a positive integer'))).toBe(true);
    });

    it('rejects week = 0', () => {
      const header = 'week,day,title,category';
      const rows = ['0,1,Training,training'];
      const csv = [header, ...rows].join('\n');
      const result = parseScheduleCsv(csv);
      expect(result.errors.some(e => e.includes('"week" must be a positive integer'))).toBe(true);
    });

    it('rejects invalid day value (0 or 8)', () => {
      const header = 'week,day,title,category';
      const csv1 = [header, '1,0,Training,training'].join('\n');
      const csv2 = [header, '1,8,Training,training'].join('\n');

      expect(parseScheduleCsv(csv1).errors.some(e => e.includes('"day" must be 1-7'))).toBe(true);
      expect(parseScheduleCsv(csv2).errors.some(e => e.includes('"day" must be 1-7'))).toBe(true);
    });

    it('rejects empty title', () => {
      const header = 'week,day,title,category';
      const csv = [header, '1,1,,training'].join('\n');
      const result = parseScheduleCsv(csv);
      expect(result.errors.some(e => e.includes('"title" cannot be empty'))).toBe(true);
    });

    it('rejects empty category', () => {
      const header = 'week,day,title,category';
      const csv = [header, '1,1,Training,'].join('\n');
      const result = parseScheduleCsv(csv);
      expect(result.errors.some(e => e.includes('"category" cannot be empty'))).toBe(true);
    });

    it('rejects RPE out of range', () => {
      const header = 'week,day,title,category,intensity_rpe_min,intensity_rpe_max';
      const rows = Array.from({ length: 7 }, (_, i) =>
        `1,${i + 1},Training,training,${i === 0 ? '0' : '5'},${i === 0 ? '11' : '7'}`
      );
      const csv = [header, ...rows].join('\n');
      const result = parseScheduleCsv(csv);
      expect(result.errors.some(e => e.includes('"intensity_rpe_min" must be 1-10'))).toBe(true);
      expect(result.errors.some(e => e.includes('"intensity_rpe_max" must be 1-10'))).toBe(true);
    });

    it('auto-fills missing days as rest (no longer rejects incomplete weeks)', () => {
      const header = 'week,day,title,category';
      const rows = Array.from({ length: 5 }, (_, i) =>
        `1,${i + 1},Training,training`
      );
      const csv = [header, ...rows].join('\n');
      const result = parseScheduleCsv(csv);
      expect(result.errors.filter(e => !e.startsWith('Warning:'))).toEqual([]);
      expect(result.scheduleData).toHaveLength(7);
      // Days 6 and 7 should be auto-filled rest days
      const day6 = result.scheduleData.find(d => d.day === 6)!;
      const day7 = result.scheduleData.find(d => d.day === 7)!;
      expect(day6.category).toBe('rest');
      expect(day6.title).toBe('Rest');
      expect(day7.category).toBe('rest');
    });

    it('rejects duplicate week+day', () => {
      const header = 'week,day,title,category';
      const rows = [
        '1,1,Training,training',
        '1,1,Training again,training', // duplicate
        ...Array.from({ length: 5 }, (_, i) => `1,${i + 2},Rest,rest`),
      ];
      const csv = [header, ...rows].join('\n');
      const result = parseScheduleCsv(csv);
      // 8 entries for week 1 → "must have exactly 7 day entries" or duplicate error
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('warns about unknown columns (non-fatal)', () => {
      const header = 'week,day,title,category,extra_col';
      const rows = Array.from({ length: 7 }, (_, i) =>
        `1,${i + 1},${i === 6 ? 'Rest' : 'Training'},${i === 6 ? 'rest' : 'training'},foo`
      );
      const csv = [header, ...rows].join('\n');
      const result = parseScheduleCsv(csv);
      expect(result.errors.some(e => e.startsWith('Warning:') && e.includes('extra_col'))).toBe(true);
      // Should still parse successfully (warnings are non-fatal)
      expect(result.scheduleData).toHaveLength(7);
    });

    it('skips blank rows', () => {
      const csv = makeWeekCsv();
      const csvWithBlanks = csv + '\n\n\n';
      const result = parseScheduleCsv(csvWithBlanks);
      expect(result.errors.filter(e => !e.startsWith('Warning:'))).toEqual([]);
      expect(result.scheduleData).toHaveLength(7);
    });

    it('strips UTF-8 BOM from Excel exports', () => {
      const csv = '\uFEFF' + makeWeekCsv();
      const result = parseScheduleCsv(csv);
      expect(result.errors.filter(e => !e.startsWith('Warning:'))).toEqual([]);
      expect(result.numWeeks).toBe(1);
      expect(result.scheduleData).toHaveLength(7);
    });
  });

  // ─── Minimal required columns ────────────────────────────

  describe('minimal columns', () => {
    it('works with only required columns (week, day, title, category)', () => {
      const header = 'week,day,title,category';
      const rows = Array.from({ length: 7 }, (_, i) =>
        `1,${i + 1},${i === 6 ? 'Rest' : 'Training'},${i === 6 ? 'rest' : 'training'}`
      );
      const csv = [header, ...rows].join('\n');
      const result = parseScheduleCsv(csv);
      expect(result.errors.filter(e => !e.startsWith('Warning:'))).toEqual([]);
      expect(result.numWeeks).toBe(1);
      expect(result.scheduleData).toHaveLength(7);
      expect(result.scheduleData[0].durationMin).toBeNull();
      expect(result.scheduleData[0].durationMax).toBeNull();
    });
  });

  // ─── Rest day detection ──────────────────────────────────

  describe('rest day detection', () => {
    it('detects rest by category "rest"', () => {
      const header = 'week,day,title,category';
      const rows = Array.from({ length: 7 }, (_, i) =>
        `1,${i + 1},Day off,${i === 0 ? 'rest' : (i === 6 ? 'rest' : 'training')}`
      );
      const csv = [header, ...rows].join('\n');
      const result = parseScheduleCsv(csv);
      const day1 = result.scheduleData.find(d => d.day === 1)!;
      expect(day1.blocks[0].name).toBe('Rest');
    });

    it('detects rest by category "recovery"', () => {
      const header = 'week,day,title,category';
      const rows = Array.from({ length: 7 }, (_, i) =>
        `1,${i + 1},Light walk,${i === 0 ? 'recovery' : (i === 6 ? 'rest' : 'training')}`
      );
      const csv = [header, ...rows].join('\n');
      const result = parseScheduleCsv(csv);
      const day1 = result.scheduleData.find(d => d.day === 1)!;
      expect(day1.blocks[0].name).toBe('Rest');
    });

    it('detects rest by title "Rest" regardless of category', () => {
      const header = 'week,day,title,category';
      const rows = Array.from({ length: 7 }, (_, i) =>
        `1,${i + 1},${i === 0 ? 'Rest' : 'Training'},${i === 6 ? 'rest' : 'training'}`
      );
      const csv = [header, ...rows].join('\n');
      const result = parseScheduleCsv(csv);
      const day1 = result.scheduleData.find(d => d.day === 1)!;
      expect(day1.blocks[0].name).toBe('Rest');
    });
  });

  // ─── Semicolon delimiter ────────────────────────────────

  describe('semicolon delimiter (European Excel)', () => {
    it('parses semicolon-delimited CSV', () => {
      const header = 'week;day;title;category';
      const rows = Array.from({ length: 7 }, (_, i) =>
        `1;${i + 1};${i === 6 ? 'Rest' : 'Training'};${i === 6 ? 'rest' : 'training'}`
      );
      const csv = [header, ...rows].join('\n');
      const result = parseScheduleCsv(csv);
      expect(result.errors.filter(e => !e.startsWith('Warning:'))).toEqual([]);
      expect(result.scheduleData).toHaveLength(7);
      expect(result.scheduleData[0].title).toBe('Training');
    });

    it('handles quoted fields with semicolons inside', () => {
      const header = 'week;day;title;category';
      const rows = Array.from({ length: 7 }, (_, i) =>
        i === 0
          ? `1;${i + 1};"Flat work; extended";training`
          : `1;${i + 1};Rest;rest`
      );
      const csv = [header, ...rows].join('\n');
      const result = parseScheduleCsv(csv);
      expect(result.errors.filter(e => !e.startsWith('Warning:'))).toEqual([]);
      expect(result.scheduleData[0].title).toBe('Flat work; extended');
    });
  });

  // ─── Header aliases ─────────────────────────────────────

  describe('header aliases', () => {
    it('maps "Session" to title and "Type" to category', () => {
      const header = 'week,day,session,type';
      const rows = Array.from({ length: 7 }, (_, i) =>
        `1,${i + 1},${i === 6 ? 'Rest' : 'Flatwork'},${i === 6 ? 'rest' : 'training'}`
      );
      const csv = [header, ...rows].join('\n');
      const result = parseScheduleCsv(csv);
      expect(result.errors.filter(e => !e.startsWith('Warning:'))).toEqual([]);
      expect(result.scheduleData[0].title).toBe('Flatwork');
    });

    it('maps "Workout" to title', () => {
      const header = 'week,day,workout,category';
      const rows = Array.from({ length: 7 }, (_, i) =>
        `1,${i + 1},${i === 6 ? 'Rest' : 'Jumping'},${i === 6 ? 'rest' : 'training'}`
      );
      const csv = [header, ...rows].join('\n');
      const result = parseScheduleCsv(csv);
      expect(result.errors.filter(e => !e.startsWith('Warning:'))).toEqual([]);
      expect(result.scheduleData[0].title).toBe('Jumping');
    });

    it('strips "Week #" hash and "Duration (min)" parens', () => {
      const header = 'Week #,Day,Title,Category,Duration (min)';
      const rows = Array.from({ length: 7 }, (_, i) =>
        `1,${i + 1},${i === 6 ? 'Rest' : 'Training'},${i === 6 ? 'rest' : 'training'},45`
      );
      const csv = [header, ...rows].join('\n');
      const result = parseScheduleCsv(csv);
      expect(result.errors.filter(e => !e.startsWith('Warning:'))).toEqual([]);
      expect(result.scheduleData[0].durationMin).toBe(45);
    });
  });

  // ─── Auto-fill rest days ────────────────────────────────

  describe('auto-fill rest days', () => {
    it('fills missing days when only training days provided', () => {
      const header = 'week,day,title,category';
      // Only provide Mon-Fri (days 1-5)
      const rows = Array.from({ length: 5 }, (_, i) =>
        `1,${i + 1},Training day ${i + 1},training`
      );
      const csv = [header, ...rows].join('\n');
      const result = parseScheduleCsv(csv);
      expect(result.errors.filter(e => !e.startsWith('Warning:'))).toEqual([]);
      expect(result.scheduleData).toHaveLength(7);
      expect(result.numWeeks).toBe(1);
    });

    it('fills a single-day week with 6 rest days', () => {
      const header = 'week,day,title,category';
      const csv = [header, '1,3,Jumping,training'].join('\n');
      const result = parseScheduleCsv(csv);
      expect(result.errors.filter(e => !e.startsWith('Warning:'))).toEqual([]);
      expect(result.scheduleData).toHaveLength(7);
      const restDays = result.scheduleData.filter(d => d.category === 'rest');
      expect(restDays).toHaveLength(6);
    });

    it('fills across multiple weeks independently', () => {
      const header = 'week,day,title,category';
      const rows = [
        '1,1,Training,training',
        '1,3,Training,training',
        '2,2,Training,training',
        '2,5,Training,training',
      ];
      const csv = [header, ...rows].join('\n');
      const result = parseScheduleCsv(csv);
      expect(result.errors.filter(e => !e.startsWith('Warning:'))).toEqual([]);
      expect(result.scheduleData).toHaveLength(14);
      expect(result.numWeeks).toBe(2);
    });
  });
});
