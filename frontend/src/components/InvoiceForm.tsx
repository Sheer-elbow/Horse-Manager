import { useState, useEffect, FormEvent, useRef } from 'react';
import { Button } from './ui/button';
import { api } from '../api/client';
import { createInvoice, updateInvoice, createRecurringInvoice } from '../api/invoices';
import type { Horse, Invoice, InvoiceStatus, InvoiceType } from '../types';
import { Upload, X, FileText, Image as ImageIcon, SplitSquareVertical, Equal, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

const CATEGORIES = [
  'Farrier', 'Vet', 'Dentist', 'Vaccinations', 'Feed & Supplements',
  'Stabling', 'Training', 'Arena Hire', 'Competition', 'Grooming',
  'Equipment', 'Transport', 'Insurance', 'Bar Tab', 'Other',
];

interface SplitRow {
  horseId: string;
  amount: string;
}

interface Props {
  onSaved: (invoice: Invoice) => void;
  onCancel: () => void;
  initialInvoice?: Invoice | null;
  onRecurringSaved?: () => void;
}

export default function InvoiceForm({ onSaved, onCancel, initialInvoice, onRecurringSaved }: Props) {
  const { user } = useAuth();
  const isStable = user?.role === 'STABLE_LEAD' || user?.role === 'ADMIN';

  const [horses, setHorses] = useState<Horse[]>([]);
  const [loadingHorses, setLoadingHorses] = useState(true);

  // Form fields
  const [type, setType] = useState<InvoiceType>(initialInvoice?.type ?? (isStable ? 'STABLE' : 'OWNER'));
  const [supplier, setSupplier] = useState(initialInvoice?.supplier ?? '');
  const [category, setCategory] = useState(initialInvoice?.category ?? '');
  const [customCategory, setCustomCategory] = useState('');
  const [date, setDate] = useState(initialInvoice?.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [totalAmount, setTotalAmount] = useState(initialInvoice?.totalAmount ?? '');
  const [notes, setNotes] = useState(initialInvoice?.notes ?? '');
  const [status, setStatus] = useState<InvoiceStatus>(initialInvoice?.status ?? 'CONFIRMED');

  // Recurring (only for new invoices, not edits)
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDay, setRecurringDay] = useState(1);
  const [recurringEndDate, setRecurringEndDate] = useState('');

  // Splits
  const [selectedHorseIds, setSelectedHorseIds] = useState<string[]>(
    initialInvoice?.splits.map((s) => s.horseId) ?? []
  );
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
  const [customSplits, setCustomSplits] = useState<SplitRow[]>(
    initialInvoice?.splits.map((s) => ({ horseId: s.horseId, amount: s.amount })) ?? []
  );

  // File
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const effectiveCategory = category === 'Other' ? customCategory : category;

  useEffect(() => {
    api<Horse[]>('/horses').then((h) => {
      setHorses(h);
    }).catch(() => {
      toast.error('Failed to load horses');
    }).finally(() => setLoadingHorses(false));
  }, []);

  // Auto-compute equal splits when total or selection changes
  const computedSplits = (): { horseId: string; ownerId?: string; amount: number }[] => {
    if (selectedHorseIds.length === 0) return [];
    const total = parseFloat(String(totalAmount)) || 0;

    if (splitMode === 'equal') {
      const share = Math.round((total / selectedHorseIds.length) * 100) / 100;
      // Handle rounding: last horse gets the remainder
      const splits = selectedHorseIds.map((horseId, i) => {
        const isLast = i === selectedHorseIds.length - 1;
        const allocated = selectedHorseIds.slice(0, -1).reduce((s) => s + share, 0);
        return {
          horseId,
          amount: isLast ? Math.round((total - allocated) * 100) / 100 : share,
        };
      });
      return splits;
    }

    return customSplits
      .filter((s) => selectedHorseIds.includes(s.horseId))
      .map((s) => ({ horseId: s.horseId, amount: parseFloat(s.amount) || 0 }));
  };

  // When horses are selected/deselected, sync custom splits
  const toggleHorse = (horseId: string) => {
    setSelectedHorseIds((prev) => {
      const next = prev.includes(horseId) ? prev.filter((id) => id !== horseId) : [...prev, horseId];
      // Sync customSplits rows
      setCustomSplits((cs) => {
        const existing = new Map(cs.map((s) => [s.horseId, s]));
        return next.map((id) => existing.get(id) ?? { horseId: id, amount: '' });
      });
      return next;
    });
  };

  const handleSelectAll = () => {
    const allIds = horses.map((h) => h.id);
    setSelectedHorseIds(allIds);
    setCustomSplits(allIds.map((id) => ({ horseId: id, amount: '' })));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && f.type.startsWith('image/')) {
      const url = URL.createObjectURL(f);
      setFilePreview(url);
    } else {
      setFilePreview(null);
    }
  };

  const removeFile = () => {
    setFile(null);
    setFilePreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const equalSplitPreview = (() => {
    const total = parseFloat(String(totalAmount)) || 0;
    if (!selectedHorseIds.length || !total) return null;
    const share = (total / selectedHorseIds.length).toFixed(2);
    return `£${share} each`;
  })();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const finalCategory = effectiveCategory.trim();
    if (!finalCategory) { setError('Category is required'); return; }
    if (!date) { setError('Date is required'); return; }
    const total = parseFloat(String(totalAmount));
    if (!total || total <= 0) { setError('Total amount must be greater than 0'); return; }
    if (selectedHorseIds.length === 0) { setError('Select at least one horse'); return; }

    const splits = computedSplits();
    if (splitMode === 'custom') {
      const splitTotal = splits.reduce((s, sp) => s + sp.amount, 0);
      if (Math.abs(splitTotal - total) > 0.01) {
        setError(`Split amounts (£${splitTotal.toFixed(2)}) must equal total (£${total.toFixed(2)})`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        type,
        supplier: supplier.trim() || undefined,
        category: finalCategory,
        date,
        totalAmount: total,
        notes: notes.trim() || undefined,
        status,
        splits,
        file: file ?? undefined,
      };

      const saved = initialInvoice
        ? await updateInvoice(initialInvoice.id, payload)
        : await createInvoice(payload);

      // If recurring is enabled, also create the template (for future months)
      if (!initialInvoice && isRecurring) {
        await createRecurringInvoice({
          type,
          supplier: supplier.trim() || undefined,
          category: finalCategory,
          totalAmount: total,
          notes: notes.trim() || undefined,
          dayOfMonth: recurringDay,
          startDate: date,
          endDate: recurringEndDate || undefined,
          lastGeneratedDate: date, // first invoice already created manually — skip this month
          splits,
        });
        toast.success('Invoice added and recurring schedule created');
        onRecurringSaved?.();
      } else {
        toast.success(initialInvoice ? 'Invoice updated' : 'Invoice added');
      }

      onSaved(saved);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save invoice';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedHorseNames = horses.filter((h) => selectedHorseIds.includes(h.id));

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Type toggle — only show for stable leads / admins */}
      {(user?.role === 'STABLE_LEAD' || user?.role === 'ADMIN') && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Type</label>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {(['OWNER', 'STABLE'] as InvoiceType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex-1 py-2 font-medium transition-colors ${
                  type === t ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t === 'OWNER' ? 'Owner Expense' : 'Stable Bill'}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {type === 'OWNER' ? 'Expense you\'re splitting between your horses' : 'Bill from the stable assigned to owners/horses'}
          </p>
        </div>
      )}

      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Category <span className="text-red-500">*</span></label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Select category…</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {category === 'Other' && (
          <input
            type="text"
            value={customCategory}
            onChange={(e) => setCustomCategory(e.target.value)}
            placeholder="Describe the expense…"
            className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        )}
      </div>

      {/* Date + Total */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date <span className="text-red-500">*</span></label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Total (£) <span className="text-red-500">*</span></label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Supplier */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Supplier / Provider</label>
        <input
          type="text"
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          placeholder="e.g. Smith Farriery, Valley Vets…"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* Horse selector */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-gray-700">Split Between Horses <span className="text-red-500">*</span></label>
          {horses.length > 1 && (
            <button type="button" onClick={handleSelectAll} className="text-xs text-brand-600 hover:underline">
              Select all
            </button>
          )}
        </div>
        {loadingHorses ? (
          <div className="text-sm text-gray-400 py-2">Loading horses…</div>
        ) : (
          <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
            {horses.map((horse) => (
              <label
                key={horse.id}
                className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                  selectedHorseIds.includes(horse.id)
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedHorseIds.includes(horse.id)}
                  onChange={() => toggleHorse(horse.id)}
                  className="sr-only"
                />
                <span className="truncate font-medium">{horse.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Split mode */}
      {selectedHorseIds.length > 1 && (
        <div>
          <div className="flex items-center gap-3 mb-2">
            <label className="block text-sm font-medium text-gray-700">Split Method</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setSplitMode('equal')}
                className={`flex items-center gap-1 px-3 py-1.5 font-medium transition-colors ${
                  splitMode === 'equal' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Equal className="w-3 h-3" /> Equal
              </button>
              <button
                type="button"
                onClick={() => setSplitMode('custom')}
                className={`flex items-center gap-1 px-3 py-1.5 font-medium transition-colors ${
                  splitMode === 'custom' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <SplitSquareVertical className="w-3 h-3" /> Custom
              </button>
            </div>
          </div>

          {splitMode === 'equal' && equalSplitPreview && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
              {equalSplitPreview} across {selectedHorseIds.length} horses
              <div className="mt-1 space-y-0.5">
                {computedSplits().map((s) => {
                  const h = horses.find((h) => h.id === s.horseId);
                  return (
                    <div key={s.horseId} className="flex justify-between text-xs text-green-600">
                      <span>{h?.name}</span><span>£{s.amount.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {splitMode === 'custom' && (
            <div className="space-y-2">
              {customSplits.map((row, i) => {
                const horse = horses.find((h) => h.id === row.horseId);
                return (
                  <div key={row.horseId} className="flex items-center gap-2">
                    <span className="text-sm text-gray-700 flex-1 truncate">{horse?.name}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-500">£</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.amount}
                        onChange={(e) => {
                          const next = [...customSplits];
                          next[i] = { ...next[i], amount: e.target.value };
                          setCustomSplits(next);
                        }}
                        className="w-24 rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>
                );
              })}
              <div className="text-xs text-gray-500 text-right">
                Total allocated: £{customSplits.filter((s) => selectedHorseIds.includes(s.horseId)).reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0).toFixed(2)}
                {' / '}£{(parseFloat(String(totalAmount)) || 0).toFixed(2)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Single horse selected — just show it */}
      {selectedHorseIds.length === 1 && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-700">
          Full amount assigned to {selectedHorseNames[0]?.name}
        </div>
      )}

      {/* Recurring toggle — only for new invoices */}
      {!initialInvoice && (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setIsRecurring((p) => !p)}
            className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors ${
              isRecurring ? 'bg-brand-50 text-brand-700' : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Make this a monthly recurring cost
            </span>
            <div className={`w-9 h-5 rounded-full transition-colors ${isRecurring ? 'bg-brand-600' : 'bg-gray-200'}`}>
              <div className={`w-4 h-4 bg-white rounded-full shadow m-0.5 transition-transform ${isRecurring ? 'translate-x-4' : ''}`} />
            </div>
          </button>

          {isRecurring && (
            <div className="px-4 pb-4 pt-1 bg-brand-50 border-t border-brand-100 space-y-3">
              <p className="text-xs text-brand-600">
                Today's invoice will be added, and then a new invoice will auto-generate each month.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Bill on day of month</label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={recurringDay}
                    onChange={(e) => setRecurringDay(Math.min(28, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">Max 28 (avoids month-end issues)</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">End date (optional)</label>
                  <input
                    type="date"
                    value={recurringEndDate}
                    onChange={(e) => setRecurringEndDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">Leave blank for indefinite</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Additional details…"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
        />
      </div>

      {/* File attachment */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Attachment (invoice / receipt)</label>
        {!file && !initialInvoice?.fileUrl ? (
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-lg p-4 cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-colors">
            <Upload className="w-5 h-5 text-gray-400" />
            <span className="text-sm text-gray-500">Upload PDF or photo</span>
            <span className="text-xs text-gray-400">Max 20MB</span>
            <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={handleFileChange} className="sr-only" />
          </label>
        ) : (
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            {filePreview ? (
              <img src={filePreview} alt="preview" className="w-12 h-12 object-cover rounded" />
            ) : (
              <div className="w-12 h-12 bg-red-50 rounded flex items-center justify-center">
                {file?.type === 'application/pdf' || initialInvoice?.fileName?.endsWith('.pdf')
                  ? <FileText className="w-6 h-6 text-red-500" />
                  : <ImageIcon className="w-6 h-6 text-gray-400" />
                }
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate">{file?.name || initialInvoice?.fileName}</p>
              {file && <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(0)} KB</p>}
            </div>
            <button type="button" onClick={removeFile} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        )}
        {/* Show existing attachment if editing and no new file chosen */}
        {!file && initialInvoice?.fileUrl && (
          <p className="text-xs text-gray-500 mt-1">Existing attachment retained. Upload a new file to replace it.</p>
        )}
      </div>

      {/* Status */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="CONFIRMED">Confirmed</option>
          <option value="PAID">Paid</option>
          <option value="DRAFT">Draft</option>
        </select>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : initialInvoice ? 'Update Invoice' : 'Add Invoice'}
        </Button>
      </div>
    </form>
  );
}
