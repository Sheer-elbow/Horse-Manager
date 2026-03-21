import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listInvoices, deleteInvoice, updateInvoiceStatus,
  listRecurringInvoices, toggleRecurringInvoice, deleteRecurringInvoice,
} from '../api/invoices';
import type { Invoice, InvoiceStatus, RecurringInvoice } from '../types';
import { Button } from '../components/ui/button';
import Modal from '../components/Modal';
import InvoiceForm from '../components/InvoiceForm';
import { Skeleton } from '../components/Skeleton';
import { toast } from 'sonner';
import { Plus, Receipt, Trash2, Pencil, FileText, Filter, CheckCircle2, Circle, Clock, RefreshCw, Pause, Play } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getAccessToken } from '../api/client';

const STATUS_BADGE: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700',
};

const STATUS_ICONS: Record<InvoiceStatus, React.FC<{ className?: string }>> = {
  DRAFT: Clock,
  CONFIRMED: Circle,
  PAID: CheckCircle2,
};

const TYPE_BADGE: Record<string, string> = {
  OWNER: 'bg-purple-100 text-purple-700',
  STABLE: 'bg-amber-100 text-amber-700',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatAmount(amount: string | number) {
  return `£${parseFloat(String(amount)).toFixed(2)}`;
}

type FilterStatus = 'ALL' | InvoiceStatus;

export default function Invoices() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');
  const [filterCategory, setFilterCategory] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);

  // Recurring
  const [recurring, setRecurring] = useState<RecurringInvoice[]>([]);
  const [showRecurring, setShowRecurring] = useState(false);
  const [confirmDeleteRecurringId, setConfirmDeleteRecurringId] = useState<string | null>(null);

  const canManage = user?.role === 'ADMIN' || user?.role === 'OWNER' || user?.role === 'STABLE_LEAD';

  const load = async () => {
    setLoading(true);
    try {
      const [data, recData] = await Promise.all([
        listInvoices({
          status: filterStatus === 'ALL' ? undefined : filterStatus,
          category: filterCategory || undefined,
        }),
        listRecurringInvoices(),
      ]);
      setInvoices(data);
      setRecurring(recData);
    } catch {
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterStatus, filterCategory]);

  const handleSaved = () => {
    setShowForm(false);
    setEditingInvoice(null);
    load();
  };

  const handleToggleRecurring = async (id: string) => {
    try {
      const updated = await toggleRecurringInvoice(id);
      setRecurring((prev) => prev.map((r) => r.id === id ? updated : r));
      toast.success(updated.active ? 'Recurring invoice resumed' : 'Recurring invoice paused');
    } catch {
      toast.error('Failed to update recurring invoice');
    }
  };

  const handleDeleteRecurring = async (id: string) => {
    try {
      await deleteRecurringInvoice(id);
      setRecurring((prev) => prev.filter((r) => r.id !== id));
      setConfirmDeleteRecurringId(null);
      toast.success('Recurring invoice deleted');
    } catch {
      toast.error('Failed to delete recurring invoice');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteInvoice(id);
      setInvoices((prev) => prev.filter((inv) => inv.id !== id));
      setConfirmDeleteId(null);
      toast.success('Invoice deleted');
    } catch {
      toast.error('Failed to delete invoice');
    }
  };

  const handleStatusCycle = async (invoice: Invoice) => {
    const next: InvoiceStatus = invoice.status === 'DRAFT'
      ? 'CONFIRMED'
      : invoice.status === 'CONFIRMED'
        ? 'PAID'
        : 'CONFIRMED';
    try {
      const updated = await updateInvoiceStatus(invoice.id, next);
      setInvoices((prev) => prev.map((inv) => inv.id === updated.id ? updated : inv));
    } catch {
      toast.error('Failed to update status');
    }
  };

  const grouped = invoices.reduce<Record<string, Invoice[]>>((acc, inv) => {
    const month = new Date(inv.date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    if (!acc[month]) acc[month] = [];
    acc[month].push(inv);
    return acc;
  }, {});

  const totalThisYear = invoices
    .filter((inv) => {
      const y = new Date(inv.date).getFullYear();
      return y === new Date().getFullYear() && inv.status !== 'DRAFT';
    })
    .reduce((sum, inv) => sum + parseFloat(inv.totalAmount), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track expenses and split costs across horses</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate('/costs')}>
            View Cost Dashboard
          </Button>
          {canManage && (
            <Button onClick={() => { setEditingInvoice(null); setShowForm(true); }}>
              <Plus className="w-4 h-4 mr-1.5" /> Add Invoice
            </Button>
          )}
        </div>
      </div>

      {/* Year summary */}
      {!loading && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500 mb-0.5">This year</p>
            <p className="text-xl font-bold text-gray-900">{formatAmount(totalThisYear)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500 mb-0.5">Total invoices</p>
            <p className="text-xl font-bold text-gray-900">{invoices.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500 mb-0.5">Unpaid</p>
            <p className="text-xl font-bold text-gray-900">
              {invoices.filter((i) => i.status === 'CONFIRMED').length}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="w-4 h-4 text-gray-400" />
        {(['ALL', 'DRAFT', 'CONFIRMED', 'PAID'] as FilterStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filterStatus === s
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
        <input
          type="text"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          placeholder="Filter by category…"
          className="ml-2 px-3 py-1 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Receipt className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No invoices yet</p>
          {canManage && (
            <p className="text-sm text-gray-400 mt-1">Add your first invoice to start tracking costs</p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([month, items]) => (
            <div key={month}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-gray-600">{month}</h3>
                <span className="text-xs text-gray-400">
                  {formatAmount(items.reduce((s, i) => s + parseFloat(i.totalAmount), 0))}
                </span>
              </div>
              <div className="space-y-2">
                {items.map((invoice) => {
                  const StatusIcon = STATUS_ICONS[invoice.status];
                  return (
                    <div
                      key={invoice.id}
                      className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[invoice.status]}`}>
                              <StatusIcon className="w-3 h-3" />
                              {invoice.status.charAt(0) + invoice.status.slice(1).toLowerCase()}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_BADGE[invoice.type]}`}>
                              {invoice.type === 'OWNER' ? 'Owner' : 'Stable'}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                              {invoice.category}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-gray-900">{formatAmount(invoice.totalAmount)}</p>
                            {invoice.supplier && (
                              <span className="text-sm text-gray-500">· {invoice.supplier}</span>
                            )}
                            <span className="text-xs text-gray-400">{formatDate(invoice.date)}</span>
                          </div>
                          {invoice.splits.length > 0 && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              Split: {invoice.splits.map((s) => `${s.horse.name} (${formatAmount(s.amount)})`).join(', ')}
                            </p>
                          )}
                          {invoice.notes && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate">{invoice.notes}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {invoice.fileUrl && (
                            <a
                              href={invoice.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Authenticated file access via fetch
                                e.preventDefault();
                                const token = getAccessToken();
                                fetch(invoice.fileUrl!, { headers: { Authorization: `Bearer ${token}` } })
                                  .then((r) => r.blob())
                                  .then((blob) => {
                                    const url = URL.createObjectURL(blob);
                                    window.open(url, '_blank');
                                  });
                              }}
                              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
                              title="View attachment"
                            >
                              <FileText className="w-4 h-4" />
                            </a>
                          )}
                          {canManage && (
                            <>
                              <button
                                onClick={() => handleStatusCycle(invoice)}
                                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
                                title={`Mark as ${invoice.status === 'PAID' ? 'Confirmed' : invoice.status === 'DRAFT' ? 'Confirmed' : 'Paid'}`}
                              >
                                <StatusIcon className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => { setEditingInvoice(invoice); setShowForm(true); }}
                                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(invoice.id)}
                                className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-gray-500 hover:text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit form modal */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); setEditingInvoice(null); }}
        title={editingInvoice ? 'Edit Invoice' : 'Add Invoice'}
        wide
      >
        <InvoiceForm
          initialInvoice={editingInvoice}
          onSaved={handleSaved}
          onRecurringSaved={load}
          onCancel={() => { setShowForm(false); setEditingInvoice(null); }}
        />
      </Modal>

      {/* Delete invoice confirm */}
      <Modal
        open={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        title="Delete Invoice"
      >
        <p className="text-sm text-gray-600 mb-4">Are you sure you want to delete this invoice? This cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
          <Button variant="destructive" onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}>Delete</Button>
        </div>
      </Modal>

      {/* Recurring invoices panel */}
      {canManage && recurring.length > 0 && (
        <div className="border-t border-gray-200 pt-6">
          <button
            onClick={() => setShowRecurring((p) => !p)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900 mb-3"
          >
            <RefreshCw className="w-4 h-4 text-gray-500" />
            Recurring Schedules ({recurring.length})
            <span className="text-xs text-gray-400 font-normal ml-1">{showRecurring ? '▲ hide' : '▼ show'}</span>
          </button>

          {showRecurring && (
            <div className="space-y-2">
              {recurring.map((rec) => (
                <div key={rec.id} className={`bg-white rounded-xl border px-4 py-3 flex items-center gap-3 ${rec.active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                  <RefreshCw className={`w-4 h-4 shrink-0 ${rec.active ? 'text-brand-500' : 'text-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900 text-sm">{rec.category}</span>
                      {rec.supplier && <span className="text-xs text-gray-500">· {rec.supplier}</span>}
                      <span className="text-xs font-semibold text-gray-900">£{parseFloat(rec.totalAmount).toFixed(2)}/mo</span>
                      {!rec.active && <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-500">Paused</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Day {rec.dayOfMonth} each month
                      {rec.endDate ? ` · ends ${new Date(rec.endDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}` : ' · no end date'}
                      {' · '}
                      {rec.splits.map((s) => s.horse.name).join(', ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleRecurring(rec.id)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
                      title={rec.active ? 'Pause' : 'Resume'}
                    >
                      {rec.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteRecurringId(rec.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors text-gray-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete recurring confirm */}
      <Modal
        open={!!confirmDeleteRecurringId}
        onClose={() => setConfirmDeleteRecurringId(null)}
        title="Delete Recurring Schedule"
      >
        <p className="text-sm text-gray-600 mb-2">Are you sure you want to delete this recurring schedule?</p>
        <p className="text-sm text-gray-500 mb-4">Past invoices already generated will be kept. Only the schedule will be removed.</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmDeleteRecurringId(null)}>Cancel</Button>
          <Button variant="destructive" onClick={() => confirmDeleteRecurringId && handleDeleteRecurring(confirmDeleteRecurringId)}>Delete Schedule</Button>
        </div>
      </Modal>
    </div>
  );
}
