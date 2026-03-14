import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Stethoscope, Scissors, Smile, Syringe, Receipt, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { Skeleton } from './Skeleton';
import { AuthenticatedImage } from './AuthenticatedImage';
import { Link } from 'react-router-dom';

export interface TimelineEvent {
  id: string;
  type: 'vet' | 'farrier' | 'dentist' | 'vaccination' | 'expense';
  date: string;
  title: string;
  subtitle: string | null;
  notes: string | null;
  fileUrl: string | null;
  fileName: string | null;
  extra: Record<string, string | null>;
}

const TYPE_CONFIG: Record<TimelineEvent['type'], {
  label: string;
  dotClass: string;
  badgeClass: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = {
  vet:         { label: 'Vet',        dotClass: 'bg-blue-500',   badgeClass: 'bg-blue-100 text-blue-700',   Icon: Stethoscope },
  farrier:     { label: 'Farrier',    dotClass: 'bg-green-500',  badgeClass: 'bg-green-100 text-green-700', Icon: Scissors    },
  dentist:     { label: 'Dentist',    dotClass: 'bg-purple-500', badgeClass: 'bg-purple-100 text-purple-700',Icon: Smile       },
  vaccination: { label: 'Vaccine',    dotClass: 'bg-amber-500',  badgeClass: 'bg-amber-100 text-amber-700', Icon: Syringe     },
  expense:     { label: 'Expense',    dotClass: 'bg-gray-400',   badgeClass: 'bg-gray-100 text-gray-600',   Icon: Receipt     },
};

const ALL_TYPES = Object.keys(TYPE_CONFIG) as TimelineEvent['type'][];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function groupByMonthYear(events: TimelineEvent[]): { label: string; events: TimelineEvent[] }[] {
  const groups: Map<string, TimelineEvent[]> = new Map();
  for (const e of events) {
    const d = new Date(e.date);
    const key = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  return Array.from(groups.entries()).map(([label, events]) => ({ label, events }));
}

function EventCard({ event }: { event: TimelineEvent }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = TYPE_CONFIG[event.type];
  const hasExtra = event.notes || event.fileUrl;

  return (
    <div className="bg-white rounded-xl border p-3.5 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-3">
        {/* Type icon */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.badgeClass}`}>
          <cfg.Icon className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-start gap-2 flex-wrap">
            <span className="font-medium text-sm text-gray-900">{event.title}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.badgeClass}`}>{cfg.label}</span>
          </div>

          {/* Subtitle (practitioner name, amount, next due, etc.) */}
          {event.subtitle && (
            <div className="text-xs text-gray-500 mt-0.5">{event.subtitle}</div>
          )}

          {/* Expanded section */}
          {expanded && (
            <div className="mt-2 space-y-2">
              {event.notes && (
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{event.notes}</p>
              )}
              {event.fileUrl && (
                <div>
                  {event.fileName?.match(/\.(jpg|jpeg|png|webp|gif)$/i) ? (
                    <a href={event.fileUrl} target="_blank" rel="noopener noreferrer">
                      <AuthenticatedImage
                        src={event.fileUrl}
                        alt={event.fileName || 'Attachment'}
                        className="max-w-xs max-h-48 rounded-lg border object-cover"
                        fallback={<div className="w-32 h-24 rounded-lg bg-gray-100 border flex items-center justify-center"><FileText className="w-6 h-6 text-gray-400" /></div>}
                      />
                    </a>
                  ) : (
                    <a
                      href={event.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline"
                    >
                      <FileText className="w-4 h-4" /> {event.fileName || 'View attachment'}
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Date + expand toggle */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className="text-xs text-gray-400 whitespace-nowrap">{formatDate(event.date)}</span>
          {hasExtra && (
            <button
              onClick={() => setExpanded((x) => !x)}
              className="text-gray-400 hover:text-gray-600"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface Props {
  horseId: string;
}

export default function HealthTimeline({ horseId }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTypes, setActiveTypes] = useState<Set<TimelineEvent['type']>>(new Set(ALL_TYPES));

  useEffect(() => {
    api<TimelineEvent[]>(`/health/${horseId}/timeline`)
      .then(setEvents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [horseId]);

  function toggleType(type: TimelineEvent['type']) {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size === 1) return prev; // keep at least one
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2 flex-wrap">
          {ALL_TYPES.map((t) => <Skeleton key={t} className="h-7 w-20 rounded-full" />)}
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <Skeleton className="w-3 h-3 rounded-full mt-1" />
              <Skeleton className="w-0.5 h-16 mt-1" />
            </div>
            <div className="flex-1 pb-4">
              <Skeleton className="h-4 w-32 mb-1" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const filtered = events.filter((e) => activeTypes.has(e.type));
  const groups = groupByMonthYear(filtered);

  // Compute gap warnings: flag if gap between same-type events exceeds threshold
  const thresholds: Partial<Record<TimelineEvent['type'], number>> = {
    farrier: 70,  // > 10 weeks
    vet: 365,     // > 1 year
  };

  // Build last-seen map per type for gap detection
  const gapWarnings = new Set<string>();
  const lastSeenByType: Partial<Record<TimelineEvent['type'], Date>> = {};
  // Events are newest-first, so iterate reversed to go oldest-first for gap calc
  for (const e of [...events].reverse()) {
    const threshold = thresholds[e.type];
    if (threshold) {
      const prev = lastSeenByType[e.type];
      const curr = new Date(e.date);
      if (prev) {
        const gapDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
        if (gapDays > threshold) gapWarnings.add(e.id);
      }
      lastSeenByType[e.type] = curr;
    }
  }

  return (
    <div className="space-y-4">
      {/* Legend / filter pills */}
      <div className="flex gap-2 flex-wrap">
        {ALL_TYPES.map((type) => {
          const cfg = TYPE_CONFIG[type];
          const count = events.filter((e) => e.type === type).length;
          if (count === 0) return null;
          const active = activeTypes.has(type);
          return (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                active
                  ? `${cfg.badgeClass} border-transparent`
                  : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${active ? cfg.dotClass : 'bg-gray-300'}`} />
              {cfg.label}
              <span className="opacity-60">({count})</span>
            </button>
          );
        })}
        {filtered.length !== events.length && (
          <button
            onClick={() => setActiveTypes(new Set(ALL_TYPES))}
            className="text-xs text-brand-600 hover:underline px-1"
          >
            Show all
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center">
          <p className="text-sm text-gray-500">No health records yet.</p>
          <p className="text-xs text-gray-400 mt-1">Records added in the Vet, Farrier, Dentist, and Vaccinations tabs appear here.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.label}>
              {/* Month/year heading */}
              <div className="flex items-center gap-3 mb-3">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                  {group.label}
                </div>
                <div className="flex-1 border-t border-gray-100" />
                <div className="text-xs text-gray-400">{group.events.length} event{group.events.length !== 1 ? 's' : ''}</div>
              </div>

              {/* Events in this month */}
              <div className="relative">
                {/* Vertical timeline line */}
                <div className="absolute left-3.5 top-0 bottom-0 w-px bg-gray-100" />

                <div className="space-y-2">
                  {group.events.map((event) => {
                    const cfg = TYPE_CONFIG[event.type];
                    const hasGap = gapWarnings.has(event.id);
                    return (
                      <div key={event.id} className="flex gap-3 pl-0">
                        {/* Dot on the line */}
                        <div className="flex flex-col items-center shrink-0 w-7 pt-3.5">
                          <div className={`w-3 h-3 rounded-full border-2 border-white ring-1 ring-gray-200 z-10 shrink-0 ${cfg.dotClass}`} />
                        </div>

                        {/* Card */}
                        <div className="flex-1 min-w-0 pb-2">
                          {hasGap && (
                            <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mb-1.5">
                              Long gap since previous {cfg.label.toLowerCase()} visit
                            </div>
                          )}
                          <EventCard event={event} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
