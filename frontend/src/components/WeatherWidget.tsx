import { useEffect, useState } from 'react';
import { Droplets, Wind, Sun, MapPin } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { Skeleton } from './Skeleton';
import { WeatherForecast, DailyForecast } from '../types';

// ─── WMO code → emoji ─────────────────────────────────────────────────────────
// https://open-meteo.com/en/docs#weathervariables
function wmoEmoji(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 2) return '⛅';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 57) return '🌦️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  if (code <= 86) return '🌨️';
  return '⛈️';
}

// ─── Equestrian conditions indicator ─────────────────────────────────────────
// Gives stable managers a quick red/amber/green read on each day.
type ConditionLevel = 'good' | 'caution' | 'poor';

function conditionLevel(day: DailyForecast): ConditionLevel {
  if (day.precipitationProbability > 70 || day.windGustsMax > 45) return 'poor';
  if (day.precipitationProbability > 40 || day.windGustsMax > 28) return 'caution';
  return 'good';
}

const CONDITION_STYLES: Record<ConditionLevel, { dot: string; label: string; text: string }> = {
  good:    { dot: 'bg-green-400',  label: 'Good',    text: 'text-green-700' },
  caution: { dot: 'bg-amber-400',  label: 'Caution', text: 'text-amber-700' },
  poor:    { dot: 'bg-red-400',    label: 'Poor',    text: 'text-red-700'   },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function shortDay(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'short' });
}

function formatTime(isoDatetime: string): string {
  // Open-Meteo returns "2026-04-05T06:12" (no Z) — treat as local time
  return isoDatetime.slice(11, 16);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatChip({ icon, value, title }: { icon: React.ReactNode; value: string; title: string }) {
  return (
    <span className="inline-flex items-center gap-1" title={title}>
      {icon}
      <span className="text-gray-700">{value}</span>
    </span>
  );
}

function MiniDayTile({ day, isToday }: { day: DailyForecast; isToday: boolean }) {
  const level = conditionLevel(day);
  const style = CONDITION_STYLES[level];

  return (
    <div
      className={`flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg min-w-[48px] ${
        isToday ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-gray-50'
      }`}
      title={`${day.description} · ${day.precipitationProbability}% rain · gusts ${day.windGustsMax} km/h`}
    >
      <span className="text-[11px] font-medium text-gray-500">{isToday ? 'Today' : shortDay(day.date)}</span>
      <span className="text-xl leading-none">{wmoEmoji(day.weatherCode)}</span>
      <span className="text-xs font-semibold text-gray-800">{day.tempMax}°</span>
      <span className="text-[11px] text-gray-400">{day.precipitationProbability}%</span>
      {/* Conditions dot */}
      <span
        className={`w-1.5 h-1.5 rounded-full mt-0.5 ${style.dot}`}
        title={`Conditions: ${style.label}`}
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  stableId: string;
  stableName?: string;
}

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: WeatherForecast }
  | { status: 'no-location'; hint: string }
  | { status: 'error' };

export default function WeatherWidget({ stableId, stableName }: Props) {
  const [state, setState] = useState<FetchState>({ status: 'idle' });

  useEffect(() => {
    if (!stableId) return;
    setState({ status: 'loading' });

    api<WeatherForecast>(`/weather?stableId=${encodeURIComponent(stableId)}`)
      .then((data) => setState({ status: 'success', data }))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 422) {
          const hint = (err.body as { hint?: string })?.hint ?? 'Add a postcode to enable weather.';
          setState({ status: 'no-location', hint });
        } else {
          setState({ status: 'error' });
        }
      });
  }, [stableId]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <Skeleton className="h-4 w-32" />
        <div className="flex gap-4">
          <Skeleton className="h-16 w-24 rounded-lg" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-20 w-12 rounded-lg" />)}
        </div>
      </div>
    );
  }

  // ── No location ────────────────────────────────────────────────────────────
  if (state.status === 'no-location') {
    return (
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-start gap-3 text-sm text-gray-500">
          <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
          <div>
            <span className="font-medium text-gray-700">Weather unavailable — </span>
            {state.hint}
          </div>
        </div>
      </div>
    );
  }

  // ── API error ──────────────────────────────────────────────────────────────
  if (state.status === 'error') {
    return (
      <div className="bg-white rounded-xl border p-4 text-sm text-gray-400 text-center">
        Weather data temporarily unavailable.
      </div>
    );
  }

  // ── Success ────────────────────────────────────────────────────────────────
  const { data } = state;
  const today = data.days[0];
  const futureDays = data.days.slice(1);
  const todayLevel = conditionLevel(today);
  const todayStyle = CONDITION_STYLES[todayLevel];

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-0">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
          Weather · {stableName ?? 'This stable'}
        </span>
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
          todayLevel === 'good'    ? 'bg-green-50 text-green-700' :
          todayLevel === 'caution' ? 'bg-amber-50 text-amber-700' :
                                     'bg-red-50 text-red-700'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${todayStyle.dot}`} />
          {todayStyle.label} conditions today
        </span>
      </div>

      {/* Today card */}
      <div className="px-4 pt-3 pb-4">
        <div className="flex items-start gap-4">
          {/* Icon + temps */}
          <div className="flex flex-col items-center gap-0 min-w-[64px]">
            <span className="text-5xl leading-none">{wmoEmoji(today.weatherCode)}</span>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className="text-2xl font-bold text-gray-900">{today.tempMax}°</span>
              <span className="text-base text-gray-400 font-medium">{today.tempMin}°</span>
            </div>
          </div>

          {/* Description + stats */}
          <div className="flex-1 min-w-0 pt-1">
            <div className="text-sm font-semibold text-gray-800 mb-2">{today.description}</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <StatChip
                icon={<Droplets className="w-3.5 h-3.5 text-blue-400" />}
                value={`${today.precipitationProbability}%${today.precipitationSum > 0 ? ` · ${today.precipitationSum}mm` : ''}`}
                title="Precipitation probability"
              />
              <StatChip
                icon={<Wind className="w-3.5 h-3.5 text-gray-400" />}
                value={`${today.windSpeedMax} km/h${today.windGustsMax > today.windSpeedMax + 5 ? ` gusts ${today.windGustsMax}` : ''}`}
                title="Wind speed and gusts"
              />
              <StatChip
                icon={<Sun className="w-3.5 h-3.5 text-amber-400" />}
                value={`UV ${today.uvIndexMax}`}
                title="UV index"
              />
            </div>
            {/* Sunrise / sunset */}
            <div className="text-[11px] text-gray-400 mt-1.5">
              🌅 {formatTime(today.sunrise)} &nbsp;·&nbsp; 🌇 {formatTime(today.sunset)}
            </div>
          </div>
        </div>
      </div>

      {/* 6-day mini forecast */}
      {futureDays.length > 0 && (
        <div className="border-t px-3 pb-3 pt-2">
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {futureDays.map((day) => (
              <MiniDayTile key={day.date} day={day} isToday={false} />
            ))}
          </div>
        </div>
      )}

      {/* Attribution — required by Open-Meteo CC BY 4.0 */}
      <div className="px-4 pb-2.5 text-[10px] text-gray-300 text-right">
        Weather by{' '}
        <a
          href="https://open-meteo.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-400 transition-colors"
        >
          Open-Meteo
        </a>
      </div>
    </div>
  );
}
