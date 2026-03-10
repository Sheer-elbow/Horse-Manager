import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { SecuritySummary, SecurityEventsPage, SecurityEvent, SecurityEventType } from '../types';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { ShieldAlert, LogIn, UserX, KeyRound, RefreshCw } from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const EVENT_LABELS: Record<SecurityEventType, string> = {
  LOGIN_SUCCESS: 'Successful sign-in',
  LOGIN_FAILURE: 'Failed sign-in attempt',
  PASSWORD_RESET_REQUESTED: 'Password reset requested',
  PASSWORD_RESET_USED: 'Password reset completed',
  PASSWORD_CHANGED: 'Password changed',
  INVITE_SENT: 'Invitation sent',
  INVITE_ACCEPTED: 'Invitation accepted',
  ROLE_CHANGED: 'User role changed',
  USER_DELETED: 'Account deleted',
  ACCESS_DENIED: 'Access denied',
};

const OUTCOME_BADGE = {
  success: <Badge variant="success">Success</Badge>,
  failure: <Badge variant="danger">Blocked</Badge>,
  info: <Badge variant="info">Info</Badge>,
};

function who(e: SecurityEvent): string {
  if (e.user?.name) return `${e.user.name} (${e.user.email ?? e.email ?? '—'})`;
  if (e.user?.email) return e.user.email;
  if (e.email) return e.email;
  return 'Unknown';
}

function metaSummary(e: SecurityEvent): string | null {
  if (!e.metadata) return null;
  const m = e.metadata;
  if (e.eventType === 'ROLE_CHANGED') {
    return `${m.targetEmail} changed from ${m.fromRole} to ${m.toRole}`;
  }
  if (e.eventType === 'USER_DELETED') {
    return `${m.deletedEmail ?? m.deletedId} (${m.deletedRole}) was removed`;
  }
  if (e.eventType === 'INVITE_SENT') {
    return `${m.invitedEmail} invited as ${m.role}`;
  }
  if (e.eventType === 'INVITE_ACCEPTED') {
    return `Joined as ${m.name} (${m.role})`;
  }
  return null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sublabel,
  alert,
}: {
  label: string;
  value: number;
  sublabel: string;
  alert?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl border p-5 ${alert && value > 0 ? 'border-red-200 bg-red-50' : ''}`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${alert && value > 0 ? 'text-red-600' : 'text-gray-900'}`}>
        {value}
      </p>
      <p className="text-xs text-gray-400 mt-1">{sublabel}</p>
    </div>
  );
}

function EventRow({ e }: { e: SecurityEvent }) {
  const detail = metaSummary(e);
  return (
    <tr className="border-b last:border-0 hover:bg-gray-50/50">
      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
        <span title={fullDate(e.createdAt)}>{relativeTime(e.createdAt)}</span>
        <span className="block text-xs text-gray-400">{fullDate(e.createdAt)}</span>
      </td>
      <td className="px-4 py-3 text-sm">{who(e)}</td>
      <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{e.ipAddress}</td>
      <td className="px-4 py-3 text-sm">
        {EVENT_LABELS[e.eventType]}
        {detail && <span className="block text-xs text-gray-400 mt-0.5">{detail}</span>}
      </td>
      <td className="px-4 py-3">{OUTCOME_BADGE[e.outcome] ?? <Badge>{e.outcome}</Badge>}</td>
    </tr>
  );
}

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center gap-3 justify-end mt-4 text-sm text-gray-600">
      <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <span>
        Page {page} of {totalPages}
      </span>
      <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </div>
  );
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab({ summary, onRefresh }: { summary: SecuritySummary; onRefresh: () => void }) {
  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Sign-ins today" value={summary.loginsToday} sublabel="Successful logins" />
        <StatCard
          label="Failed attempts"
          value={summary.failedLoginsLast24h}
          sublabel="Last 24 hours"
          alert
        />
        <StatCard
          label="Account changes"
          value={summary.accountChangesLast7d}
          sublabel="Role changes, deletions & invites (7 days)"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent alerts */}
        <div className="bg-white rounded-xl border">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-500" />
              Recent alerts
            </h3>
            <button onClick={onRefresh} className="text-gray-400 hover:text-gray-600">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          {summary.recentAlerts.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-green-600 font-medium">
              ✓ No suspicious activity in the last 24 hours
            </div>
          ) : (
            <ul className="divide-y">
              {summary.recentAlerts.map((e) => (
                <li key={e.id} className="px-4 py-3 flex items-start gap-3">
                  <span className="mt-0.5 text-red-500 shrink-0">
                    <ShieldAlert className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{EVENT_LABELS[e.eventType]}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {who(e)} · {e.ipAddress}
                    </p>
                  </div>
                  <span className="ml-auto text-xs text-gray-400 whitespace-nowrap shrink-0">
                    {relativeTime(e.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Top suspicious IPs */}
        <div className="bg-white rounded-xl border">
          <div className="px-4 py-3 border-b">
            <h3 className="font-semibold text-gray-900">Suspicious IPs (last 24 h)</h3>
            <p className="text-xs text-gray-400 mt-0.5">IP addresses with the most failed sign-in attempts</p>
          </div>
          {summary.topFailingIps.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-green-600 font-medium">
              ✓ No suspicious IPs detected
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-500">IP address</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500">Failed attempts</th>
                </tr>
              </thead>
              <tbody>
                {summary.topFailingIps.map((row) => (
                  <tr key={row.ip} className="border-b last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">{row.ip}</td>
                    <td className="px-4 py-2 text-right">
                      <Badge variant={row.count >= 5 ? 'danger' : 'warning'}>{row.count}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: All Events ──────────────────────────────────────────────────────────

const TYPE_FILTERS: { label: string; value: SecurityEventType | '' }[] = [
  { label: 'All events', value: '' },
  { label: 'Successful sign-ins', value: 'LOGIN_SUCCESS' },
  { label: 'Failed sign-ins', value: 'LOGIN_FAILURE' },
  { label: 'Password changes', value: 'PASSWORD_CHANGED' },
  { label: 'Password resets', value: 'PASSWORD_RESET_REQUESTED' },
  { label: 'Invitations', value: 'INVITE_SENT' },
  { label: 'Role changes', value: 'ROLE_CHANGED' },
  { label: 'Account deletions', value: 'USER_DELETED' },
  { label: 'Access denied', value: 'ACCESS_DENIED' },
];

function AllEventsTab() {
  const [data, setData] = useState<SecurityEventsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<SecurityEventType | ''>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (typeFilter) params.set('type', typeFilter);
      const result = await api<SecurityEventsPage>(`/security/events?${params}`);
      setData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter]);

  useEffect(() => { load(); }, [load]);

  // Reset to page 1 when filter changes
  const handleFilterChange = (v: SecurityEventType | '') => {
    setTypeFilter(v);
    setPage(1);
  };

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={typeFilter}
          onChange={(e) => handleFilterChange(e.target.value as SecurityEventType | '')}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          {TYPE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        {data && (
          <span className="text-sm text-gray-500 ml-auto">
            {data.total} event{data.total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
        ) : !data || data.events.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">No events found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">When</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Who</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">From</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">What happened</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Result</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((e) => (
                  <EventRow key={e.id} e={e} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}

// ─── Tab: Failed Logins ───────────────────────────────────────────────────────

function FailedLoginsTab({ summary }: { summary: SecuritySummary }) {
  const [data, setData] = useState<SecurityEventsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<SecurityEventsPage>(
        `/security/events?type=LOGIN_FAILURE&page=${page}`,
      );
      setData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top targeted email addresses */}
        <div className="bg-white rounded-xl border">
          <div className="px-4 py-3 border-b">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <LogIn className="w-4 h-4 text-red-400" />
              Most targeted accounts
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Email addresses with most failed attempts (24 h)</p>
          </div>
          {summary.topFailingEmails.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-green-600 font-medium">
              ✓ No targeted accounts
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-500">Email address</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500">Attempts</th>
                </tr>
              </thead>
              <tbody>
                {summary.topFailingEmails.map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-2">{row.email ?? '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <Badge variant={row.count >= 5 ? 'danger' : 'warning'}>{row.count}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Top IPs */}
        <div className="bg-white rounded-xl border">
          <div className="px-4 py-3 border-b">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              Suspicious IP addresses
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">IPs with the most failed attempts (24 h)</p>
          </div>
          {summary.topFailingIps.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-green-600 font-medium">
              ✓ No suspicious IPs
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-500">IP address</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500">Failed attempts</th>
                </tr>
              </thead>
              <tbody>
                {summary.topFailingIps.map((row) => (
                  <tr key={row.ip} className="border-b last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">{row.ip}</td>
                    <td className="px-4 py-2 text-right">
                      <Badge variant={row.count >= 5 ? 'danger' : 'warning'}>{row.count}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Chronological failed login list */}
      <div>
        <h3 className="font-semibold text-gray-900 mb-3">All failed sign-in attempts</h3>
        <div className="bg-white rounded-xl border overflow-hidden">
          {loading ? (
            <div className="py-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : !data || data.events.length === 0 ? (
            <div className="py-8 text-center text-sm text-green-600 font-medium">
              ✓ No failed sign-in attempts recorded
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">When</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Email tried</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">From IP</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Browser / device</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((e) => (
                    <tr key={e.id} className="border-b last:border-0 bg-red-50/30">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span title={fullDate(e.createdAt)}>{relativeTime(e.createdAt)}</span>
                        <span className="block text-xs text-gray-400">{fullDate(e.createdAt)}</span>
                      </td>
                      <td className="px-4 py-3">{e.email ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs">{e.ipAddress}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 max-w-xs truncate" title={e.userAgent ?? ''}>
                        {e.userAgent ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <Pagination page={page} totalPages={totalPages} onPage={setPage} />
      </div>
    </div>
  );
}

// ─── Tab: Account Changes ─────────────────────────────────────────────────────

const ACCOUNT_CHANGE_TYPES: SecurityEventType[] = [
  'ROLE_CHANGED',
  'USER_DELETED',
  'INVITE_SENT',
  'INVITE_ACCEPTED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET_USED',
];

function AccountChangesTab() {
  const [data, setData] = useState<SecurityEventsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all account-change type events.
      // The API doesn't support multi-type filter, so we fetch all and
      // filter client-side for the first page, or accept a small overfetch.
      // For a simple admin panel this is acceptable.
      const result = await api<SecurityEventsPage>(`/security/events?page=${page}`);
      // Filter to account-change events only
      const filtered = result.events.filter((e) =>
        ACCOUNT_CHANGE_TYPES.includes(e.eventType),
      );
      setData({ ...result, events: filtered });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        A record of every role change, account deletion, invitation, and password update.
      </p>
      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
        ) : !data || data.events.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">No account changes found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">When</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Changed by</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">What happened</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Details</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((e) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span title={fullDate(e.createdAt)}>{relativeTime(e.createdAt)}</span>
                      <span className="block text-xs text-gray-400">{fullDate(e.createdAt)}</span>
                    </td>
                    <td className="px-4 py-3">{who(e)}</td>
                    <td className="px-4 py-3">{EVENT_LABELS[e.eventType]}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{metaSummary(e) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Pagination page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SecurityDashboard() {
  const [summary, setSummary] = useState<SecuritySummary | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [error, setError] = useState('');

  const loadSummary = useCallback(async () => {
    setLoadingOverview(true);
    setError('');
    try {
      const s = await api<SecuritySummary>('/security/summary');
      setSummary(s);
    } catch {
      setError('Could not load security data. Please try again.');
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <KeyRound className="w-6 h-6 text-brand-600" />
            Security Dashboard
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Monitor sign-ins, access attempts, and account changes. Visible to admins only.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadSummary}>
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList className="mb-2">
          <TabsTrigger value="overview">
            Overview
          </TabsTrigger>
          <TabsTrigger value="all-events">
            All Events
          </TabsTrigger>
          <TabsTrigger value="failed-logins" className="flex items-center gap-1.5">
            Failed Sign-ins
            {summary && summary.failedLoginsLast24h > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full bg-red-500 text-white">
                {summary.failedLoginsLast24h > 9 ? '9+' : summary.failedLoginsLast24h}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="account-changes">
            Account Changes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {loadingOverview ? (
            <div className="py-16 text-center text-gray-400">Loading overview…</div>
          ) : summary ? (
            <OverviewTab summary={summary} onRefresh={loadSummary} />
          ) : null}
        </TabsContent>

        <TabsContent value="all-events">
          <AllEventsTab />
        </TabsContent>

        <TabsContent value="failed-logins">
          {summary ? (
            <FailedLoginsTab summary={summary} />
          ) : (
            <div className="py-16 text-center text-gray-400">Loading…</div>
          )}
        </TabsContent>

        <TabsContent value="account-changes">
          <AccountChangesTab />
        </TabsContent>
      </Tabs>

      <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 flex gap-2">
        <UserX className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <strong>About IP addresses:</strong> IP addresses shown here are the network addresses
          of connections to this server. If your server is behind a reverse proxy (e.g. Nginx or
          Cloudflare) make sure <code>APP_TRUST_PROXY=true</code> is set so the real visitor IP is
          captured rather than the proxy's address.
        </div>
      </div>
    </div>
  );
}
