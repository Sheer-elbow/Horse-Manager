import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCostSummary } from '../api/invoices';
import { api } from '../api/client';
import type { CostDashboardData, HorseCostSummary, Horse } from '../types';
import { Skeleton } from '../components/Skeleton';
import { toast } from 'sonner';
import { TrendingUp, ChevronLeft, ChevronRight, BarChart3, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '../components/ui/button';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CATEGORY_COLOURS = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b',
  '#ef4444', '#06b6d4', '#ec4899', '#6366f1',
  '#14b8a6', '#f97316',
];

// ─── Helpers ──────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 10000) return `£${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return `£${(n / 1000).toFixed(2)}k`;
  return `£${n.toFixed(2)}`;
}

function fmtFull(n: number): string {
  return `£${n.toFixed(2)}`;
}

// ─── Bar Chart ────────────────────────────────────────────────
// Uses absolute pixel heights so bars scale correctly regardless of
// how the flex container resolves percentage heights.

const MAIN_CHART_H = 96;   // px — grand overview
const MINI_CHART_H = 48;   // px — per-horse cards

interface BarChartProps {
  data: { month: number; amount: number }[];
  height: number;
  highlightMonth?: number;
  color?: string;
  dimColor?: string;
}

function BarChart({ data, height, highlightMonth, color = '#6366f1', dimColor = '#a5b4fc' }: BarChartProps) {
  const max = Math.max(...data.map((d) => d.amount), 0.01);

  // Y-axis guide lines (0%, 50%, 100%)
  const guides = [0, 50, 100];

  return (
    <div className="relative" style={{ height }}>
      {/* Horizontal guide lines */}
      {guides.slice(1).map((pct) => (
        <div
          key={pct}
          className="absolute left-0 right-0 border-t border-dashed border-gray-100"
          style={{ bottom: `${(pct / 100) * height}px` }}
        />
      ))}
      {/* Bars */}
      <div className="absolute inset-0 flex items-end gap-0.5 px-0.5">
        {data.map((d) => {
          const barH = max > 0 ? Math.max((d.amount / max) * height, d.amount > 0 ? 4 : 0) : 0;
          const isHighlight = d.month === highlightMonth;
          return (
            <div key={d.month} className="flex-1 flex flex-col items-center group relative">
              {/* Tooltip */}
              {d.amount > 0 && (
                <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs rounded-md px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 shadow-lg">
                  <span className="font-medium">{MONTH_LABELS[d.month - 1]}</span>
                  <span className="ml-1 text-gray-300">{fmtFull(d.amount)}</span>
                </div>
              )}
              <div
                className="w-full rounded-t-sm transition-opacity"
                style={{
                  height: `${barH}px`,
                  backgroundColor: isHighlight ? color : d.amount > 0 ? dimColor : '#f3f4f6',
                  opacity: d.amount === 0 ? 0.3 : 1,
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Horse Card ───────────────────────────────────────────────

const HORSE_PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6'];

interface HorseCardProps {
  horse: HorseCostSummary;
  rankIndex: number;
  grandTotal: number;
  color: string;
}

function HorseCard({ horse, rankIndex, grandTotal, color }: HorseCardProps) {
  const [expanded, setExpanded] = useState(false);
  const topCategory = horse.byCategory[0];
  const pctOfTotal = grandTotal > 0 ? (horse.totalAmount / grandTotal) * 100 : 0;
  const currentMonth = new Date().getMonth(); // 0-indexed
  const thisMonthSpend = horse.byMonth[currentMonth]?.amount ?? 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden transition-shadow hover:shadow-sm">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full text-left p-4"
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="font-semibold text-gray-900 truncate">{horse.horseName}</span>
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-bold text-gray-900 leading-tight">{fmt(horse.totalAmount)}</p>
            <p className="text-xs text-gray-400">{pctOfTotal.toFixed(1)}% of total</p>
          </div>
        </div>

        {/* Mini bar chart */}
        <BarChart
          data={horse.byMonth}
          height={MINI_CHART_H}
          color={color}
          dimColor={`${color}55`}
        />
        <div className="flex mt-1">
          {MONTH_LABELS.map((l, i) => (
            <span key={i} className="flex-1 text-center text-[9px] text-gray-400 leading-none">{l}</span>
          ))}
        </div>

        {/* Footer stats */}
        <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-gray-50">
          <div className="text-xs">
            <span className="text-gray-400">Avg/mo </span>
            <span className="text-gray-700 font-medium">{fmt(horse.totalAmount / 12)}</span>
          </div>
          {thisMonthSpend > 0 && (
            <div className="text-xs">
              <span className="text-gray-400">This month </span>
              <span className="text-gray-700 font-medium">{fmt(thisMonthSpend)}</span>
            </div>
          )}
          {topCategory && (
            <div className="text-xs hidden sm:block">
              <span className="text-gray-400">Top </span>
              <span className="text-gray-700 font-medium">{topCategory.category}</span>
            </div>
          )}
          <div className="text-gray-400">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </div>
      </button>

      {/* Expanded: category breakdown */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50/50">
          {horse.byCategory.length > 0 ? (
            <div className="mt-3 space-y-2">
              {horse.byCategory.map((cat, i) => {
                const pct = horse.totalAmount > 0 ? (cat.amount / horse.totalAmount) * 100 : 0;
                return (
                  <div key={cat.category}>
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="flex items-center gap-1.5 text-gray-700">
                        <span
                          className="w-2 h-2 rounded-full inline-block shrink-0"
                          style={{ backgroundColor: CATEGORY_COLOURS[i % CATEGORY_COLOURS.length] }}
                        />
                        {cat.category}
                      </span>
                      <span className="text-gray-600 font-medium">{fmtFull(cat.amount)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: CATEGORY_COLOURS[i % CATEGORY_COLOURS.length],
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400 mt-3">No breakdown available</p>
          )}
          <Link
            to={`/invoices?horseId=${horse.horseId}`}
            className="text-xs text-indigo-600 hover:underline mt-3 inline-block"
          >
            View invoices →
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────

export default function CostDashboard() {
  const [data, setData] = useState<CostDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedHorseId, setSelectedHorseId] = useState('');
  const [horses, setHorses] = useState<Horse[]>([]);

  useEffect(() => {
    api<Horse[]>('/horses').then(setHorses).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    getCostSummary({ year, horseId: selectedHorseId || undefined })
      .then(setData)
      .catch(() => toast.error('Failed to load cost data'))
      .finally(() => setLoading(false));
  }, [year, selectedHorseId]);

  const currentMonth = new Date().getMonth() + 1; // 1-indexed
  const sortedHorses = data ? [...data.horses].sort((a, b) => b.totalAmount - a.totalAmount) : [];

  // Months with actual spend
  const activeMonths = data?.grandByMonth.filter((m) => m.amount > 0) ?? [];
  const peakMonth = activeMonths.length > 0
    ? activeMonths.reduce((best, m) => m.amount > best.amount ? m : best)
    : null;
  const spentMonths = activeMonths.filter((m) => m.month <= currentMonth || year < new Date().getFullYear()).length;
  const monthlyAvg = spentMonths > 0 && data ? data.grandTotal / spentMonths : 0;

  // All-category totals
  const allCats: Record<string, number> = {};
  for (const horse of data?.horses ?? []) {
    for (const cat of horse.byCategory) {
      allCats[cat.category] = (allCats[cat.category] || 0) + cat.amount;
    }
  }
  const sortedCats = Object.entries(allCats).sort(([, a], [, b]) => b - a);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cost Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Running cost analysis across all your horses</p>
        </div>
        <Link to="/invoices">
          <Button variant="outline" size="sm">View Invoices</Button>
        </Link>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 px-2 py-1.5">
          <button onClick={() => setYear((y) => y - 1)} className="p-1 hover:bg-gray-100 rounded">
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <span className="text-sm font-semibold text-gray-900 w-12 text-center">{year}</span>
          <button
            onClick={() => setYear((y) => y + 1)}
            disabled={year >= new Date().getFullYear()}
            className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>
        <select
          value={selectedHorseId}
          onChange={(e) => setSelectedHorseId(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="">All horses</option>
          {horses.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        </div>
      ) : !data || data.grandTotal === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <BarChart3 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No cost data for {year}</p>
          <p className="text-sm text-gray-400 mt-1">Add invoices to start tracking running costs</p>
          <Link to="/invoices" className="mt-3 inline-block">
            <Button size="sm">Add Invoice</Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Summary stat strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: `Total ${year}`, value: fmt(data.grandTotal), sub: `${sortedHorses.length} horse${sortedHorses.length !== 1 ? 's' : ''}` },
              { label: 'Monthly avg', value: fmt(monthlyAvg), sub: `${spentMonths} months recorded` },
              { label: 'Peak month', value: peakMonth ? fmt(peakMonth.amount) : '—', sub: peakMonth ? MONTH_LABELS[peakMonth.month - 1] : 'n/a' },
              { label: 'Top category', value: sortedCats[0]?.[0] ?? '—', sub: sortedCats[0] ? fmt(sortedCats[0][1]) : '' },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <p className="text-xs text-gray-500 mb-0.5">{s.label}</p>
                <p className="text-lg font-bold text-gray-900 leading-tight truncate">{s.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Main bar chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-gray-700">Monthly Spend</h2>
              <span className="text-xs text-gray-400">
                hover for details · <span className="inline-block w-2 h-2 rounded-sm bg-indigo-500 align-middle" /> current month
              </span>
            </div>

            {/* Y-axis label */}
            <div className="flex gap-3 mt-3">
              <div className="flex flex-col justify-between text-right" style={{ height: MAIN_CHART_H }}>
                {[data.grandByMonth.reduce((m, d) => Math.max(m, d.amount), 0), 0].map((v, i) => (
                  <span key={i} className="text-[10px] text-gray-400 leading-none">{fmt(v)}</span>
                ))}
              </div>
              <div className="flex-1">
                <BarChart
                  data={data.grandByMonth}
                  height={MAIN_CHART_H}
                  highlightMonth={year === new Date().getFullYear() ? currentMonth : undefined}
                />
                <div className="flex mt-1.5">
                  {MONTH_LABELS.map((l, i) => (
                    <span key={i} className="flex-1 text-center text-[10px] text-gray-400">{l}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Per-horse cards */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-700">Cost Per Horse</h2>
              <span className="text-xs text-gray-400">click to expand</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {sortedHorses.map((horse, i) => (
                <HorseCard
                  key={horse.horseId}
                  horse={horse}
                  rankIndex={i}
                  grandTotal={data.grandTotal}
                  color={HORSE_PALETTE[i % HORSE_PALETTE.length]}
                />
              ))}
            </div>
          </div>

          {/* Category breakdown */}
          {sortedCats.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Spend by Category</h2>
              <div className="space-y-3">
                {sortedCats.map(([cat, amount], i) => {
                  const pct = data.grandTotal > 0 ? (amount / data.grandTotal) * 100 : 0;
                  return (
                    <div key={cat} className="flex items-center gap-3">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: CATEGORY_COLOURS[i % CATEGORY_COLOURS.length] }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700 truncate">{cat}</span>
                          <span className="font-medium text-gray-900 ml-2 shrink-0">
                            {fmtFull(amount)}
                            <span className="text-xs text-gray-400 font-normal ml-1">({pct.toFixed(1)}%)</span>
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: CATEGORY_COLOURS[i % CATEGORY_COLOURS.length],
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
