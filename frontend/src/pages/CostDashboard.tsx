import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCostSummary } from '../api/invoices';
import { api } from '../api/client';
import type { CostDashboardData, HorseCostSummary, Horse } from '../types';
import { Skeleton } from '../components/Skeleton';
import { toast } from 'sonner';
import { TrendingUp, ChevronLeft, ChevronRight, PoundSterling, BarChart3 } from 'lucide-react';
import { Button } from '../components/ui/button';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CATEGORY_COLOURS = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-amber-500',
  'bg-red-500', 'bg-cyan-500', 'bg-pink-500', 'bg-indigo-500',
  'bg-teal-500', 'bg-orange-500',
];

function formatAmount(n: number) {
  return `£${n.toFixed(2)}`;
}

function MiniBarChart({ data, max }: { data: { month: number; amount: number }[]; max: number }) {
  return (
    <div className="flex items-end gap-0.5 h-12">
      {data.map((d) => {
        const height = max > 0 ? Math.max((d.amount / max) * 100, d.amount > 0 ? 8 : 0) : 0;
        return (
          <div key={d.month} className="flex-1 flex flex-col items-center gap-0.5 group relative">
            <div
              className="w-full bg-brand-500 rounded-t transition-all"
              style={{ height: `${height}%`, minHeight: d.amount > 0 ? 4 : 0 }}
            />
            {/* Tooltip */}
            {d.amount > 0 && (
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs rounded px-1.5 py-0.5 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                {MONTH_LABELS[d.month - 1]}: {formatAmount(d.amount)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function HorseCard({ horse, rankIndex }: { horse: HorseCostSummary; rankIndex: number }) {
  const [expanded, setExpanded] = useState(false);
  const maxMonth = Math.max(...horse.byMonth.map((m) => m.amount), 1);
  const topCategory = horse.byCategory[0];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-bold shrink-0">
            #{rankIndex + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">{horse.horseName}</h3>
              <span className="text-lg font-bold text-gray-900">{formatAmount(horse.totalAmount)}</span>
            </div>
            {topCategory && (
              <p className="text-xs text-gray-500 mt-0.5">
                Top spend: {topCategory.category} ({formatAmount(topCategory.amount)})
              </p>
            )}
          </div>
        </div>
        <div className="mt-3 px-1">
          <MiniBarChart data={horse.byMonth} max={maxMonth} />
          <div className="flex justify-between mt-1">
            {MONTH_LABELS.map((l, i) => (
              <span key={i} className="text-[9px] text-gray-400 flex-1 text-center">{l}</span>
            ))}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100">
          {/* Category breakdown */}
          {horse.byCategory.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-600 mb-2">By Category</p>
              <div className="space-y-1.5">
                {horse.byCategory.map((cat, i) => {
                  const pct = horse.totalAmount > 0 ? (cat.amount / horse.totalAmount) * 100 : 0;
                  return (
                    <div key={cat.category}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-gray-700">{cat.category}</span>
                        <span className="font-medium text-gray-900">{formatAmount(cat.amount)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${CATEGORY_COLOURS[i % CATEGORY_COLOURS.length]}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 mt-3">No category breakdown available</p>
          )}

          {/* Monthly table */}
          <div className="mt-4">
            <p className="text-xs font-medium text-gray-600 mb-2">Monthly Spend</p>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1">
              {horse.byMonth.filter((m) => m.amount > 0).map((m) => (
                <div key={m.month} className="flex justify-between text-xs">
                  <span className="text-gray-500">{MONTH_LABELS[m.month - 1]}</span>
                  <span className="font-medium text-gray-800">{formatAmount(m.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3">
            <Link
              to={`/invoices?horseId=${horse.horseId}`}
              className="text-xs text-brand-600 hover:underline"
            >
              View all invoices for {horse.horseName} →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

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

  const maxMonthAmount = data
    ? Math.max(...data.grandByMonth.map((m) => m.amount), 1)
    : 1;

  const sortedHorses = data
    ? [...data.horses].sort((a, b) => b.totalAmount - a.totalAmount)
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cost Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Running cost analysis across all your horses</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/invoices">
            <Button variant="outline" size="sm">View Invoices</Button>
          </Link>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Year picker */}
        <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 px-2 py-1">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <span className="text-sm font-semibold text-gray-900 w-12 text-center">{year}</span>
          <button
            onClick={() => setYear((y) => y + 1)}
            disabled={year >= new Date().getFullYear()}
            className="p-1 hover:bg-gray-100 rounded transition-colors disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Horse filter */}
        <select
          value={selectedHorseId}
          onChange={(e) => setSelectedHorseId(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All horses</option>
          {horses.map((h) => (
            <option key={h.id} value={h.id}>{h.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-xl" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
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
          {/* Grand total summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm text-gray-500">Total spend {year}</p>
                <p className="text-3xl font-bold text-gray-900">{formatAmount(data.grandTotal)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">Monthly avg</p>
                <p className="text-lg font-semibold text-gray-700">
                  {formatAmount(data.grandTotal / 12)}
                </p>
              </div>
            </div>

            {/* Grand bar chart */}
            <div className="flex items-end gap-1 h-16">
              {data.grandByMonth.map((m) => {
                const pct = maxMonthAmount > 0 ? Math.max((m.amount / maxMonthAmount) * 100, m.amount > 0 ? 5 : 0) : 0;
                const isCurrentMonth = m.month === new Date().getMonth() + 1 && year === new Date().getFullYear();
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs rounded px-1.5 py-0.5 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                      {MONTH_LABELS[m.month - 1]}: {formatAmount(m.amount)}
                    </div>
                    <div
                      className={`w-full rounded-t transition-all ${isCurrentMonth ? 'bg-brand-600' : 'bg-brand-400'}`}
                      style={{ height: `${pct}%`, minHeight: m.amount > 0 ? 4 : 0 }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex mt-1">
              {MONTH_LABELS.map((l, i) => (
                <span key={i} className="flex-1 text-center text-[9px] text-gray-400">{l}</span>
              ))}
            </div>
          </div>

          {/* Per-horse cards */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-700">Cost Per Horse</h2>
              <span className="text-xs text-gray-400">Click to expand</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {sortedHorses.map((horse, i) => (
                <HorseCard key={horse.horseId} horse={horse} rankIndex={i} />
              ))}
            </div>
          </div>

          {/* Category summary across all horses */}
          {(() => {
            const allCats: Record<string, number> = {};
            for (const horse of data.horses) {
              for (const cat of horse.byCategory) {
                allCats[cat.category] = (allCats[cat.category] || 0) + cat.amount;
              }
            }
            const sorted = Object.entries(allCats).sort(([, a], [, b]) => b - a);
            if (sorted.length === 0) return null;
            return (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <PoundSterling className="w-4 h-4 text-gray-500" />
                  Spend by Category
                </h2>
                <div className="space-y-2">
                  {sorted.map(([cat, amount], i) => {
                    const pct = data.grandTotal > 0 ? (amount / data.grandTotal) * 100 : 0;
                    return (
                      <div key={cat}>
                        <div className="flex justify-between text-sm mb-0.5">
                          <span className="text-gray-700">{cat}</span>
                          <span className="font-medium text-gray-900">{formatAmount(amount)} <span className="text-xs text-gray-400">({pct.toFixed(1)}%)</span></span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${CATEGORY_COLOURS[i % CATEGORY_COLOURS.length]}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
