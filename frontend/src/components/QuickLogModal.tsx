import { useState, useEffect, FormEvent } from 'react';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import Modal from './Modal';
import { api } from '../api/client';
import { Select } from './ui/select';
import { Horse } from '../types';
import { AuthenticatedImage } from './AuthenticatedImage';
import { useAuth } from '../contexts/AuthContext';

const SESSION_PRESETS = ['Flat work', 'Jumping', 'Lunging', 'Hack', 'Polo practice', 'Stick & ball', 'Swimming', 'Rest day', 'Walk only'];

interface Props {
  open: boolean;
  onClose: () => void;
  horses: Horse[];
  onLogged?: () => void;
}

function defaultSlot(): 'AM' | 'PM' {
  return new Date().getHours() < 12 ? 'AM' : 'PM';
}

interface FormState {
  date: string;
  slot: 'AM' | 'PM';
  sessionType: string;
  durationMinutes: string;
  intensityRpe: string;
  rider: string;
  notes: string;
}

function initialForm(): FormState {
  return {
    date: new Date().toISOString().split('T')[0],
    slot: defaultSlot(),
    sessionType: '',
    durationMinutes: '',
    intensityRpe: '',
    rider: '',
    notes: '',
  };
}

export default function QuickLogModal({ open, onClose, horses, onLogged }: Props) {
  const { user } = useAuth();
  const [form, setForm] = useState<FormState>(initialForm);
  const [selectedHorses, setSelectedHorses] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sort: user's own horses (OWNER_EDIT / ADMIN) before shared/view-only horses
  const myHorses = horses.filter((h) => h._accessType === 'OWNER_EDIT' || h._accessType === 'ADMIN');
  const otherHorses = horses.filter((h) => h._accessType !== 'OWNER_EDIT' && h._accessType !== 'ADMIN');
  const sortedHorses = [...myHorses, ...otherHorses];

  useEffect(() => {
    if (open) {
      setForm({ ...initialForm(), rider: user?.name ?? '' });
      setSelectedHorses(horses.length === 1 ? new Set([horses[0].id]) : new Set());
      setError('');
    }
  }, [open, horses, user]);

  function toggleHorse(id: string) {
    setSelectedHorses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedHorses.size === horses.length) {
      setSelectedHorses(new Set());
    } else {
      setSelectedHorses(new Set(horses.map((h) => h.id)));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (selectedHorses.size === 0) {
      setError('Select at least one horse.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await Promise.all(
        Array.from(selectedHorses).map((horseId) =>
          api('/sessions', {
            method: 'POST',
            body: JSON.stringify({
              horseId,
              date: form.date,
              slot: form.slot,
              sessionType: form.sessionType || null,
              durationMinutes: form.durationMinutes ? parseInt(form.durationMinutes) : null,
              intensityRpe: form.intensityRpe ? parseInt(form.intensityRpe) : null,
              rider: form.rider || null,
              notes: form.notes || null,
            }),
          })
        )
      );
      const count = selectedHorses.size;
      toast.success(count === 1 ? 'Session logged' : `Session logged for ${count} horses`);
      onLogged?.();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to log session');
    } finally {
      setLoading(false);
    }
  }

  const field = (key: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const allSelected = horses.length > 0 && selectedHorses.size === horses.length;

  return (
    <Modal open={open} onClose={onClose} title="Log session">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Horse picker — first so users confirm which horse(s) immediately */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Horse{horses.length !== 1 ? 's' : ''}</label>
            {horses.length > 1 && (
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs text-brand-600 hover:underline"
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>
          <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
            {horses.length === 0 ? (
              <p className="p-3 text-sm text-gray-500">No horses available.</p>
            ) : (
              sortedHorses.map((h, idx) => {
                const selected = selectedHorses.has(h.id);
                const isFirstOther = myHorses.length > 0 && otherHorses.length > 0 && idx === myHorses.length;
                return (
                  <>
                    {isFirstOther && (
                      <div key={`divider-${h.id}`} className="px-3 py-1.5 bg-gray-50 text-xs text-gray-400 font-medium border-t">
                        Shared horses
                      </div>
                    )}
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => toggleHorse(h.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-gray-50 ${
                      selected ? 'bg-brand-50' : ''
                    }`}
                  >
                    {h.photoUrl ? (
                      <AuthenticatedImage
                        src={h.photoUrl}
                        alt={h.name}
                        className="w-8 h-8 rounded-md object-cover border shrink-0"
                        fallback={
                          <div className="w-8 h-8 rounded-md bg-gray-100 border flex items-center justify-center text-gray-300 text-base shrink-0">
                            &#x1f40e;
                          </div>
                        }
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-md bg-gray-100 border flex items-center justify-center text-gray-300 text-base shrink-0">
                        &#x1f40e;
                      </div>
                    )}
                    <span className="flex-1 text-sm font-medium text-gray-800">{h.name}</span>
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        selected
                          ? 'bg-brand-600 border-brand-600'
                          : 'border-gray-300'
                      }`}
                    >
                      {selected && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>
                  </>
                );
              })
            )}
          </div>
          {selectedHorses.size > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              {selectedHorses.size} horse{selectedHorses.size !== 1 ? 's' : ''} selected
            </p>
          )}
        </div>

        {/* Date + slot */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => field('date', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slot</label>
            <Select
              value={form.slot}
              onChange={(e) => field('slot', e.target.value as 'AM' | 'PM')}
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </Select>
          </div>
        </div>

        {/* Session type — chips sized to 44px touch target */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Session type</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {SESSION_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => field('sessionType', form.sessionType === p ? '' : p)}
                className={`inline-flex items-center min-h-[44px] px-3 py-2 rounded-full text-sm font-medium transition-colors ${
                  form.sessionType === p
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <input
            value={form.sessionType}
            onChange={(e) => field('sessionType', e.target.value)}
            placeholder="Or type custom..."
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {/* Duration + RPE */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label>
            <input
              type="number"
              min="1"
              value={form.durationMinutes}
              onChange={(e) => field('durationMinutes', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">RPE (1–10)</label>
            <input
              type="number"
              min="1"
              max="10"
              value={form.intensityRpe}
              onChange={(e) => field('intensityRpe', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Rider — pre-filled from logged-in user's name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Rider</label>
          <input
            value={form.rider}
            onChange={(e) => field('rider', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => field('notes', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            rows={2}
          />
        </div>

        {error && (
          <div className="p-2 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading || selectedHorses.size === 0}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
        >
          {loading
            ? 'Saving...'
            : selectedHorses.size > 1
            ? `Save session for ${selectedHorses.size} horses`
            : 'Save session'}
        </button>
      </form>
    </Modal>
  );
}
