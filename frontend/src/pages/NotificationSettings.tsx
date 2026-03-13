import { useEffect, useState, FormEvent } from 'react';
import { api } from '../api/client';
import { Button } from '../components/ui/button';
import { Bell, BellOff, Stethoscope, Scissors, Syringe, Calendar, BarChart2 } from 'lucide-react';
import { toast } from 'sonner';

interface NotificationPrefs {
  emailEnabled: boolean;
  vaccinationReminderDays: number | null;
  overdueVaccinationAlert: boolean;
  vetCheckupReminderDays: number | null;
  farrierReminderDays: number | null;
  unloggedSessionAlert: boolean;
  weeklyDigest: boolean;
  appointmentReminderDays: number | null;
}

const VACCINATION_REMINDER_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Off', value: null },
  { label: '7 days before', value: 7 },
  { label: '14 days before', value: 14 },
  { label: '21 days before', value: 21 },
  { label: '30 days before', value: 30 },
];

const VET_REMINDER_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Off', value: null },
  { label: 'If no visit in 3 months', value: 90 },
  { label: 'If no visit in 6 months', value: 180 },
  { label: 'If no visit in 12 months', value: 365 },
];

const FARRIER_REMINDER_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Off', value: null },
  { label: 'If no visit in 6 weeks', value: 42 },
  { label: 'If no visit in 8 weeks', value: 56 },
  { label: 'If no visit in 10 weeks', value: 70 },
];

const APPOINTMENT_REMINDER_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Off', value: null },
  { label: '1 day before', value: 1 },
  { label: '2 days before', value: 2 },
  { label: '3 days before', value: 3 },
  { label: '7 days before', value: 7 },
];

function Toggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${enabled ? 'bg-brand-600' : 'bg-gray-200'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: number | null;
  options: { label: string; value: number | null }[];
  onChange: (v: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === '' ? null : parseInt(raw));
      }}
      disabled={disabled}
      className={`border rounded-lg px-3 py-1.5 text-sm w-full sm:w-56 ${
        disabled ? 'opacity-40 cursor-not-allowed bg-gray-50' : 'bg-white'
      }`}
      aria-label={label}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={o.value ?? ''}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

interface SettingRowProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
  children: React.ReactNode;
}

function SettingRow({ icon, title, description, disabled, children }: SettingRowProps) {
  return (
    <div className={`flex items-start justify-between gap-4 py-4 border-b last:border-0 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-3 min-w-0">
        <div className="text-gray-400 mt-0.5 shrink-0">{icon}</div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900">{title}</div>
          <div className="text-xs text-gray-500 mt-0.5">{description}</div>
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    emailEnabled: false,
    vaccinationReminderDays: null,
    overdueVaccinationAlert: false,
    vetCheckupReminderDays: null,
    farrierReminderDays: null,
    unloggedSessionAlert: false,
    weeklyDigest: false,
    appointmentReminderDays: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api<NotificationPrefs>('/notifications/preferences')
      .then((data) => setPrefs(data))
      .catch(() => toast.error('Failed to load notification preferences'))
      .finally(() => setLoading(false));
  }, []);

  const update = (patch: Partial<NotificationPrefs>) => {
    setPrefs((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/notifications/preferences', {
        method: 'PUT',
        body: JSON.stringify(prefs),
      });
      toast.success('Notification preferences saved');
      setDirty(false);
    } catch {
      toast.error('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  const disabled = !prefs.emailEnabled;

  return (
    <form onSubmit={handleSave} className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Notification settings</h2>
        <p className="text-sm text-gray-500 mt-1">
          All notifications are off by default. Enable the ones that are useful for your workflow.
          Emails are sent to your account address.
        </p>
      </div>

      {/* Master email toggle */}
      <div className={`rounded-xl border p-5 mb-6 ${prefs.emailEnabled ? 'bg-brand-50 border-brand-200' : 'bg-white'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {prefs.emailEnabled ? (
              <Bell className="w-5 h-5 text-brand-600" />
            ) : (
              <BellOff className="w-5 h-5 text-gray-400" />
            )}
            <div>
              <div className="font-semibold text-gray-900">Email notifications</div>
              <div className="text-sm text-gray-500">
                {prefs.emailEnabled
                  ? 'Enabled — configure what you want to be notified about below'
                  : 'Disabled — turn on to configure individual alerts'}
              </div>
            </div>
          </div>
          <Toggle enabled={prefs.emailEnabled} onChange={(v) => update({ emailEnabled: v })} />
        </div>
      </div>

      {/* Health section */}
      <div className="bg-white rounded-xl border mb-4">
        <div className="px-5 pt-4 pb-2 border-b">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Health reminders</h3>
        </div>
        <div className="px-5">
          <SettingRow
            icon={<Syringe className="w-4 h-4" />}
            title="Vaccination reminders"
            description="Get an email before a vaccination is due so you can book in time."
            disabled={disabled}
          >
            <SelectField
              label="Vaccination reminder"
              value={prefs.vaccinationReminderDays}
              options={VACCINATION_REMINDER_OPTIONS}
              onChange={(v) => update({ vaccinationReminderDays: v })}
              disabled={disabled}
            />
          </SettingRow>

          <SettingRow
            icon={<Syringe className="w-4 h-4" />}
            title="Overdue vaccination alerts"
            description="Get notified the day a vaccination passes its due date."
            disabled={disabled}
          >
            <Toggle
              enabled={prefs.overdueVaccinationAlert}
              onChange={(v) => update({ overdueVaccinationAlert: v })}
              disabled={disabled}
            />
          </SettingRow>

          <SettingRow
            icon={<Stethoscope className="w-4 h-4" />}
            title="Vet check-up reminders"
            description="Alert if a horse hasn't had a vet visit within your chosen interval."
            disabled={disabled}
          >
            <SelectField
              label="Vet reminder"
              value={prefs.vetCheckupReminderDays}
              options={VET_REMINDER_OPTIONS}
              onChange={(v) => update({ vetCheckupReminderDays: v })}
              disabled={disabled}
            />
          </SettingRow>

          <SettingRow
            icon={<Scissors className="w-4 h-4" />}
            title="Farrier reminders"
            description="Alert if a horse hasn't had a farrier visit within your chosen interval."
            disabled={disabled}
          >
            <SelectField
              label="Farrier reminder"
              value={prefs.farrierReminderDays}
              options={FARRIER_REMINDER_OPTIONS}
              onChange={(v) => update({ farrierReminderDays: v })}
              disabled={disabled}
            />
          </SettingRow>
        </div>
      </div>

      {/* Appointments section */}
      <div className="bg-white rounded-xl border mb-4">
        <div className="px-5 pt-4 pb-2 border-b">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Appointment reminders</h3>
        </div>
        <div className="px-5">
          <SettingRow
            icon={<Calendar className="w-4 h-4" />}
            title="Upcoming appointment reminder"
            description="Daily email at 8am listing appointments scheduled within your chosen window."
            disabled={disabled}
          >
            <SelectField
              label="Appointment reminder"
              value={prefs.appointmentReminderDays}
              options={APPOINTMENT_REMINDER_OPTIONS}
              onChange={(v) => update({ appointmentReminderDays: v })}
              disabled={disabled}
            />
          </SettingRow>
        </div>
      </div>

      {/* Training section */}
      <div className="bg-white rounded-xl border mb-6">
        <div className="px-5 pt-4 pb-2 border-b">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Training reminders</h3>
        </div>
        <div className="px-5">
          <SettingRow
            icon={<Calendar className="w-4 h-4" />}
            title="Unlogged session reminder"
            description="Evening email (8pm) if today's planned sessions haven't been logged."
            disabled={disabled}
          >
            <Toggle
              enabled={prefs.unloggedSessionAlert}
              onChange={(v) => update({ unloggedSessionAlert: v })}
              disabled={disabled}
            />
          </SettingRow>

          <SettingRow
            icon={<BarChart2 className="w-4 h-4" />}
            title="Weekly training digest"
            description="Monday morning summary of the week's planned sessions for your horses."
            disabled={disabled}
          >
            <Toggle
              enabled={prefs.weeklyDigest}
              onChange={(v) => update({ weeklyDigest: v })}
              disabled={disabled}
            />
          </SettingRow>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving || !dirty}>
          {saving ? 'Saving...' : 'Save preferences'}
        </Button>
        {!dirty && !saving && (
          <span className="text-sm text-gray-400">All changes saved</span>
        )}
      </div>
    </form>
  );
}
