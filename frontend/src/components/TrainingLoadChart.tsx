import { useEffect, useState } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { api } from '../api/client';
import { Skeleton } from './Skeleton';

interface WeekBucket {
  weekLabel: string;
  weekStart: string;
  totalMinutes: number;
  avgRpe: number | null;
  sessionCount: number;
}

interface Props {
  horseId: string;
}

const RANGE_OPTIONS = [
  { label: '8 wks', weeks: 8 },
  { label: '12 wks', weeks: 12 },
  { label: '26 wks', weeks: 26 },
];

export default function TrainingLoadChart({ horseId }: Props) {
  const [data, setData] = useState<WeekBucket[]>([]);
  const [weeks, setWeeks] = useState(12);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<WeekBucket[]>(`/sessions/analytics?horseId=${horseId}&weeks=${weeks}`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [horseId, weeks]);

  const hasData = data.some((d) => d.sessionCount > 0);

  return (
    <div className="bg-white rounded-xl border p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Training load</h3>
          <p className="text-xs text-gray-400 mt-0.5">Weekly duration &amp; avg intensity</p>
        </div>
        <div className="flex gap-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.weeks}
              onClick={() => setWeeks(opt.weeks)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                weeks === opt.weeks
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : !hasData ? (
        <div className="h-48 flex items-center justify-center text-sm text-gray-400">
          No sessions logged yet
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={data} margin={{ top: 4, right: 32, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="weekLabel"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="left"
                orientation="left"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v}m`}
                width={36}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 10]}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                width={20}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}
                formatter={(value, name) => {
                  if (name === 'Duration') return [`${value} min`, 'Duration'] as [string, string];
                  if (name === 'Avg RPE') return [value != null ? value : '—', 'Avg RPE'] as [unknown, string];
                  return [value, name] as [unknown, string];
                }}
                labelFormatter={(label) => `Week of ${label}`}
              />
              <Bar
                yAxisId="left"
                dataKey="totalMinutes"
                name="Duration"
                fill="#6366f1"
                radius={[3, 3, 0, 0]}
                maxBarSize={36}
              />
              <Line
                yAxisId="right"
                dataKey="avgRpe"
                name="Avg RPE"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 3, fill: '#f59e0b', strokeWidth: 0 }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>

          <div className="flex gap-5 mt-3 justify-center">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-3 h-3 rounded-sm inline-block bg-indigo-500" />
              Duration (min)
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-4 h-0.5 inline-block bg-amber-400 rounded-full" />
              Avg RPE (1–10)
            </span>
          </div>
        </>
      )}
    </div>
  );
}
