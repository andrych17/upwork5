'use client';

// Settings: the app_config row. Only changed keys go to admin_update_config, which validates each one.
import { useCallback, useState } from 'react';
import AdminConnections from '@/components/admin/connections';
import { useAdmin } from '@/components/admin/shell';
import { adminRpc, useLoad } from '@/lib/admin';

interface Config {
  monthly_credits: number;
  household_monthly_credits: number;
  household_max_people: number;
  welcome_trial_days: number;
  welcome_credits: number;
  cancel_hours: number;
  grace_days: number;
  bhd_per_month: number;
  booking_closes_minutes: number;
  book_ahead_days: number;
  max_weekly_sessions: number | null;
  weekly_limit_scope: 'person' | 'household';
  require_hello_video: boolean;
  hello_hold_bookings: boolean;
  sms_kinds: string[];
  /** where Contact us sends members; null = no link */
  contact_email: string | null;
  solo_monthly_cents: number;
  solo_annual_cents: number;
  household_monthly_cents: number;
  household_annual_cents: number;
  extra_1_cents: number;
  extra_5_cents: number;
}

type NumberKey = {
  [K in keyof Config]: Config[K] extends number ? K : never;
}[keyof Config];

const NUMBERS: { key: NumberKey; label: string; hint: string; min: number; max: number }[] = [
  { key: 'monthly_credits', label: 'Solo credits per month', hint: 'Given at each renewal.', min: 0, max: 100 },
  {
    key: 'household_monthly_credits',
    label: 'Household credits per month',
    hint: 'Shared by everyone on the plan.',
    min: 0,
    max: 100,
  },
  {
    key: 'household_max_people',
    label: 'People per Household',
    hint: 'Including the account holder.',
    min: 1,
    max: 10,
  },
  { key: 'welcome_trial_days', label: 'Welcome trial days', hint: 'Length of the free start.', min: 0, max: 60 },
  { key: 'welcome_credits', label: 'Welcome credits', hint: 'Credits during the trial.', min: 0, max: 50 },
  {
    key: 'cancel_hours',
    label: 'Free cancel window (hours)',
    hint: 'Later cancels keep the credit used.',
    min: 0,
    max: 168,
  },
  { key: 'grace_days', label: 'Payment grace days', hint: 'Before a past-due account loses access.', min: 0, max: 30 },
  { key: 'bhd_per_month', label: 'Bad Hair Day cards per month', hint: 'Camera-off sessions.', min: 0, max: 20 },
  {
    key: 'booking_closes_minutes',
    label: 'Booking closes (minutes before the start)',
    hint: 'Negative = after the start: late arrivals can book and enter until then. -5 = 5 minutes after the start, -60 keeps a 60-minute session open to the end.',
    min: -240,
    max: 240,
  },
  { key: 'book_ahead_days', label: 'Book ahead (days)', hint: 'How far the calendar opens.', min: 1, max: 180 },
];

type PriceKey =
  | 'solo_monthly_cents'
  | 'solo_annual_cents'
  | 'household_monthly_cents'
  | 'household_annual_cents'
  | 'extra_1_cents'
  | 'extra_5_cents';

const PRICES: { key: PriceKey; label: string; hint: string }[] = [
  { key: 'solo_monthly_cents', label: 'Solo, monthly ($)', hint: 'Charged each month.' },
  { key: 'solo_annual_cents', label: 'Solo, annual ($)', hint: 'Charged once a year.' },
  { key: 'household_monthly_cents', label: 'Household, monthly ($)', hint: 'Charged each month.' },
  { key: 'household_annual_cents', label: 'Household, annual ($)', hint: 'Charged once a year.' },
  { key: 'extra_1_cents', label: '1 extra session ($)', hint: 'Extra sessions never expire.' },
  { key: 'extra_5_cents', label: '5 extra sessions ($)', hint: 'The 5-pack.' },
];

const SMS_KINDS = [
  { key: '24h', label: '24 hours before' },
  { key: '1h', label: '1 hour before' },
];

export default function AdminSettings() {
  const { supabase } = useAdmin();
  // null = no edits yet, the form shows what is saved
  const [edits, setEdits] = useState<Config | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  // What is typed in a price box, so "26." survives until the next digit
  const [priceText, setPriceText] = useState<Record<string, string>>({});

  const fetchConfig = useCallback(async () => {
    const { data } = await supabase
      .from('app_config')
      .select(
        'monthly_credits,household_monthly_credits,household_max_people,welcome_trial_days,welcome_credits,' +
          'cancel_hours,grace_days,bhd_per_month,booking_closes_minutes,book_ahead_days,max_weekly_sessions,' +
          'weekly_limit_scope,require_hello_video,hello_hold_bookings,sms_kinds,contact_email,solo_monthly_cents,solo_annual_cents,' +
          'household_monthly_cents,household_annual_cents,extra_1_cents,extra_5_cents',
      )
      .eq('id', 1)
      .maybeSingle();
    return (data ?? null) as unknown as Config | null;
  }, [supabase]);

  const { data: saved, loading, reload } = useLoad(fetchConfig);
  const form = edits ?? saved;

  if (!form || !saved) {
    return (
      <>
        <header className="adm-head">
          <div>
            <h1>Settings</h1>
          </div>
        </header>
        {loading ? (
          <p className="adm-empty">Loading…</p>
        ) : (
          <p className="adm-msg adm-msg-error">Could not load settings. Refresh to try again.</p>
        )}
      </>
    );
  }

  const changes: Partial<Config> = {};
  (Object.keys(form) as (keyof Config)[]).forEach((key) => {
    if (JSON.stringify(form[key]) !== JSON.stringify(saved[key])) Object.assign(changes, { [key]: form[key] });
  });
  const dirty = Object.keys(changes).length > 0;
  const set = <K extends keyof Config>(key: K, value: Config[K]) => setEdits({ ...form, [key]: value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await adminRpc(supabase, 'admin_update_config', { p: changes });
    setBusy(false);
    setMsg({ text: res.ok ? 'Settings saved. They apply from now on.' : res.error, error: !res.ok });
    if (res.ok) {
      setEdits(null);
      setPriceText({});
      reload();
    }
  };

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Settings</h1>
          <p>Rules for credits, booking and reminders. Changes apply to new actions, not past ones.</p>
        </div>
      </header>
      {msg && <p className={msg.error ? 'adm-msg adm-msg-error' : 'adm-msg'}>{msg.text}</p>}
      <form onSubmit={submit}>
        <section className="adm-card">
          <div className="adm-card-head">
            <h2>Credits and booking</h2>
          </div>
          <div className="adm-card-body adm-form-grid">
            {NUMBERS.map((n) => (
              <label key={n.key} className="adm-field">
                <span>{n.label}</span>
                <input
                  className="adm-input"
                  type="number"
                  min={n.min}
                  max={n.max}
                  required
                  value={form[n.key]}
                  onChange={(e) => set(n.key, Number(e.target.value))}
                />
                <small>{n.hint}</small>
              </label>
            ))}
            <label className="adm-field">
              <span>Weekly session limit</span>
              <input
                className="adm-input"
                type="number"
                min={1}
                max={21}
                placeholder="No limit"
                value={form.max_weekly_sessions ?? ''}
                onChange={(e) => set('max_weekly_sessions', e.target.value === '' ? null : Number(e.target.value))}
              />
              <small>Leave empty for no limit.</small>
            </label>
            <label className="adm-field">
              <span>Weekly limit counts</span>
              <select
                className="adm-select"
                value={form.weekly_limit_scope}
                onChange={(e) => set('weekly_limit_scope', e.target.value as Config['weekly_limit_scope'])}
              >
                <option value="household">The whole Household together</option>
                <option value="person">Each person on their own</option>
              </select>
              <small>Solo plans are the same either way.</small>
            </label>
          </div>
        </section>

        <section className="adm-card">
          <div className="adm-card-head">
            <h2>Plans and prices</h2>
          </div>
          <div className="adm-card-body">
            <p className="adm-sub" style={{ marginBottom: '0.75rem' }}>
              In US dollars. A new price applies from the next charge: sign-ups, renewals and extra-session purchases.
              What members already paid does not change. Sessions per month and people per Household are set above.
            </p>
            <div className="adm-form-grid">
              {PRICES.map((n) => (
                <label key={n.key} className="adm-field">
                  <span>{n.label}</span>
                  <input
                    className="adm-input"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={10000}
                    step="0.01"
                    required
                    value={priceText[n.key] ?? String(form[n.key] / 100)}
                    onChange={(e) => {
                      const text = e.target.value;
                      setPriceText({ ...priceText, [n.key]: text });
                      if (text !== '' && Number.isFinite(Number(text))) set(n.key, Math.round(Number(text) * 100));
                    }}
                  />
                  <small>{n.hint}</small>
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="adm-card">
          <div className="adm-card-head">
            <h2>Hello Video and reminders</h2>
          </div>
          <div className="adm-card-body adm-form">
            <label className="adm-check">
              <input
                type="checkbox"
                checked={form.require_hello_video}
                onChange={(e) => set('require_hello_video', e.target.checked)}
              />
              Require an approved Hello Video before joining sessions
            </label>
            <label className="adm-check">
              <input
                type="checkbox"
                disabled={!form.require_hello_video}
                checked={form.hello_hold_bookings}
                onChange={(e) => set('hello_hold_bookings', e.target.checked)}
              />
              Let people book while their video waits (seats are held and released if not approved an hour before)
            </label>
            <label className="adm-field">
              <span>Contact email</span>
              <input
                className="adm-input"
                type="email"
                maxLength={120}
                placeholder="you@example.com"
                value={form.contact_email ?? ''}
                onChange={(e) => set('contact_email', e.target.value === '' ? null : e.target.value)}
              />
              <small>
                Members see it on Contact us buttons, for example after a Hello Video is declined. Leave empty for no
                link.
              </small>
            </label>
            <fieldset className="adm-field">
              <span>Also send by SMS (for members who opted in, about a cent each)</span>
              {SMS_KINDS.map((k) => (
                <label key={k.key} className="adm-check">
                  <input
                    type="checkbox"
                    checked={form.sms_kinds.includes(k.key)}
                    onChange={(e) =>
                      set(
                        'sms_kinds',
                        e.target.checked
                          ? [...form.sms_kinds, k.key].sort()
                          : form.sms_kinds.filter((x) => x !== k.key),
                      )
                    }
                  />
                  {k.label}
                </label>
              ))}
            </fieldset>
          </div>
        </section>

        <div className="adm-toolbar">
          <button type="submit" className="adm-btn adm-btn-primary" disabled={busy || !dirty}>
            Save settings
          </button>
          <button
            type="button"
            className="adm-btn"
            disabled={busy || !dirty}
            onClick={() => {
              setEdits(null);
              setPriceText({});
            }}
          >
            Undo changes
          </button>
        </div>
      </form>
      <AdminConnections />
    </>
  );
}
