'use client';

// Settings: the app_config row plus the service keys (Connections), split into tabs with one Save bar.
// Only changed config keys go to admin_update_config, which validates each one; then each typed or removed key goes
// to admin_set_service_key. Unsaved edits survive tab switches and are guarded on leaving the page.
import { useCallback, useEffect, useRef, useState } from 'react';
import ConnectionFields, { keyLabel, type StoredKey } from '@/components/admin/connections';
import { useAdmin } from '@/components/admin/shell';
import { adminRpc, fromCentralInput, toCentralInput, useLoad } from '@/lib/admin';
import { SMS_ON } from '@/lib/site';

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
  /** where the Contact us button after a declined Hello Video sends members; null = no button */
  contact_email: string | null;
  /** until then sessions look full to visitors and anyone not approved yet; null = open */
  opens_at: string | null;
  /** sessions this soon look full to people whose Hello Video is not approved yet; 0 = off */
  hello_wait_hours: number;
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

interface NumberField {
  key: NumberKey;
  label: string;
  hint: string;
  min: number;
  max: number;
}

// Welcome trial days and welcome credits are left out: nothing reads them yet, so changing them did nothing.
const CREDITS: NumberField[] = [
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
  { key: 'bhd_per_month', label: 'Bad Hair Day cards per month', hint: 'Camera-off sessions.', min: 0, max: 20 },
];

const RULES: NumberField[] = [
  {
    key: 'cancel_hours',
    label: 'Free cancel window (hours)',
    hint: 'Later cancels keep the credit used.',
    min: 0,
    max: 168,
  },
  {
    key: 'booking_closes_minutes',
    label: 'Booking closes (minutes before the start)',
    hint: 'Negative = after the start: late arrivals can book and enter until then. -5 = 5 minutes after the start, -60 keeps a 60-minute session open to the end.',
    min: -240,
    max: 240,
  },
  { key: 'book_ahead_days', label: 'Book ahead (days)', hint: 'How far the calendar opens.', min: 1, max: 180 },
];

const GRACE: NumberField = {
  key: 'grace_days',
  label: 'Payment grace days',
  hint: 'Before a past-due account loses access.',
  min: 0,
  max: 30,
};

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

const TABS = [
  { id: 'booking', label: 'Booking' },
  { id: 'prices', label: 'Prices' },
  { id: 'opening', label: 'Opening' },
  { id: 'hello', label: 'Hello Video' },
  { id: 'connections', label: 'Connections' },
] as const;
type TabId = (typeof TABS)[number]['id'];

// Which tab each config key lives on, for the unsaved-changes dot. Keys not listed are not on any tab.
const TAB_OF: Partial<Record<keyof Config, TabId>> = {
  ...Object.fromEntries([...CREDITS, ...RULES].map((f) => [f.key, 'booking'])),
  max_weekly_sessions: 'booking',
  weekly_limit_scope: 'booking',
  ...Object.fromEntries(PRICES.map((f) => [f.key, 'prices'])),
  grace_days: 'prices',
  opens_at: 'opening',
  require_hello_video: 'hello',
  hello_hold_bookings: 'hello',
  hello_wait_hours: 'hello',
  contact_email: 'hello',
  sms_kinds: 'hello',
};

const CONFIG_COLUMNS =
  'monthly_credits,household_monthly_credits,household_max_people,welcome_trial_days,welcome_credits,' +
  'cancel_hours,grace_days,bhd_per_month,booking_closes_minutes,book_ahead_days,max_weekly_sessions,' +
  'weekly_limit_scope,require_hello_video,hello_hold_bookings,sms_kinds,contact_email,opens_at,hello_wait_hours,' +
  'solo_monthly_cents,solo_annual_cents,household_monthly_cents,household_annual_cents,extra_1_cents,extra_5_cents';

const isTab = (s: string | undefined): s is TabId => TABS.some((t) => t.id === s);

export default function AdminSettings() {
  const { supabase } = useAdmin();
  // Open the tab named in the address (#prices), so a link can point straight at it. The first paint is the
  // Loading line, never the tabs, so reading the address here cannot mismatch the prerendered page.
  const [tab, setTab] = useState<TabId>(() => {
    const fromHash = typeof window === 'undefined' ? '' : window.location.hash.slice(1);
    return isTab(fromHash) ? fromHash : 'booking';
  });
  // null = no edits yet, the form shows what is saved
  const [edits, setEdits] = useState<Config | null>(null);
  // What is typed in a price box, so "26." survives until the next digit
  const [priceText, setPriceText] = useState<Record<string, string>>({});
  // Connections: new values typed, and saved keys marked for removal
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // Saved, waiting for the fresh row; edits stay on screen until it arrives so old values never flash back
  const [settling, setSettling] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});

  const fetchConfig = useCallback(async () => {
    const { data } = await supabase.from('app_config').select(CONFIG_COLUMNS).eq('id', 1).maybeSingle();
    return (data ?? null) as unknown as Config | null;
  }, [supabase]);
  const fetchKeys = useCallback(async () => {
    const res = await adminRpc(supabase, 'admin_service_keys', {});
    return res.ok ? (res.data.keys as StoredKey[]) : null;
  }, [supabase]);

  const { data: saved, loading, reload } = useLoad(fetchConfig);
  const { data: keys, loading: keysLoading, reload: reloadKeys } = useLoad(fetchKeys);

  if (settling && !loading) {
    setSettling(false);
    setEdits(null);
    setPriceText({});
  }

  const form = edits ?? saved;
  const changes: Partial<Config> = {};
  if (form && saved) {
    (Object.keys(form) as (keyof Config)[]).forEach((key) => {
      if (JSON.stringify(form[key]) !== JSON.stringify(saved[key])) Object.assign(changes, { [key]: form[key] });
    });
  }
  const keyChanges = [
    ...Object.entries(typed)
      .filter(([name, v]) => v.trim() && !removing.includes(name))
      .map(([name, v]) => ({ name, value: v.trim() })),
    ...removing.map((name) => ({ name, value: '' })),
  ];
  const pending = settling ? 0 : Object.keys(changes).length + keyChanges.length;
  const dirtyTabs = new Set<TabId>();
  if (!settling) {
    Object.keys(changes).forEach((k) => {
      const owner = TAB_OF[k as keyof Config];
      if (owner) dirtyTabs.add(owner);
    });
    if (keyChanges.length) dirtyTabs.add('connections');
  }

  // On a narrow screen the tab strip scrolls sideways: keep the open tab in view.
  const ready = Boolean(form && saved);
  useEffect(() => {
    if (ready) tabRefs.current[tab]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tab, ready]);

  // Unsaved edits: warn before closing the browser tab or following a link out of Settings.
  const hasPending = pending > 0;
  useEffect(() => {
    if (!hasPending) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const leave = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.('a[href]');
      if (!link || link.getAttribute('target') === '_blank' || link.getAttribute('href')?.startsWith('#')) return;
      if (!window.confirm('You have unsaved changes. Leave without saving?')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', leave, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', leave, true);
    };
  }, [hasPending]);

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

  const set = <K extends keyof Config>(key: K, value: Config[K]) => {
    setMsg(null);
    setEdits({ ...form, [key]: value });
  };

  const pick = (id: TabId, focus = false) => {
    setTab(id);
    window.history.replaceState(null, '', `#${id}`);
    if (focus) tabRefs.current[id]?.focus();
  };

  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const step: Record<string, number> = {
      ArrowRight: (i + 1) % TABS.length,
      ArrowLeft: (i - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    };
    if (!(e.key in step)) return;
    e.preventDefault();
    pick(TABS[step[e.key]].id, true);
  };

  const undo = () => {
    setEdits(null);
    setPriceText({});
    setTyped({});
    setRemoving([]);
    setMsg(null);
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Fields on other tabs are hidden, so the browser cannot point at them: open their tab first, then show the hint.
    const bad = e.currentTarget.querySelector<HTMLInputElement | HTMLSelectElement>('input:invalid, select:invalid');
    if (bad) {
      const owner = bad.closest<HTMLElement>('[data-tab]')?.dataset.tab;
      if (isTab(owner)) pick(owner);
      requestAnimationFrame(() => bad.reportValidity());
      return;
    }
    setBusy(true);
    setMsg(null);
    if (Object.keys(changes).length) {
      const res = await adminRpc(supabase, 'admin_update_config', { p: changes });
      if (!res.ok) {
        setBusy(false);
        setMsg({ text: `Not saved: ${res.error}`, error: true });
        return;
      }
      setSettling(true);
      reload();
    }
    const failed: string[] = [];
    for (const k of keyChanges) {
      const res = await adminRpc(supabase, 'admin_set_service_key', { p_name: k.name, p_value: k.value });
      if (res.ok) {
        setTyped((t) => Object.fromEntries(Object.entries(t).filter(([name]) => name !== k.name)));
        setRemoving((r) => r.filter((name) => name !== k.name));
      } else {
        failed.push(`${keyLabel(k.name)}: ${res.error}`);
      }
    }
    if (keyChanges.length) reloadKeys();
    setBusy(false);
    setMsg(
      failed.length
        ? { text: `Saved, except ${failed.join('; ')}`, error: true }
        : { text: 'Saved. Changes apply from now on.', error: false },
    );
  };

  const numberField = (n: NumberField) => (
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
  );

  const panel = (id: TabId, children: React.ReactNode) => (
    <div
      role="tabpanel"
      id={`set-panel-${id}`}
      aria-labelledby={`set-tab-${id}`}
      data-tab={id}
      hidden={tab !== id}
      className="adm-tabpanel"
    >
      {children}
    </div>
  );

  const saving = busy || settling;
  const state = saving ? 'busy' : msg?.error ? 'error' : pending ? 'dirty' : 'clean';
  const statusText = saving
    ? 'Saving…'
    : msg?.error
      ? msg.text
      : pending
        ? `${pending} unsaved ${pending === 1 ? 'change' : 'changes'}`
        : (msg?.text ?? 'All changes saved.');

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Settings</h1>
          <p>Rules for credits, booking and the site. Changes apply to new actions, not past ones.</p>
        </div>
      </header>

      <div className="adm-tabs adm-tabs-scroll" role="tablist" aria-label="Settings sections" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`set-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`set-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => pick(t.id)}
          >
            {t.label}
            {dirtyTabs.has(t.id) && (
              <>
                <span className="adm-tab-dot" aria-hidden="true" />
                <span className="adm-sr">, unsaved changes</span>
              </>
            )}
          </button>
        ))}
      </div>

      <form onSubmit={submit} noValidate>
        {panel(
          'booking',
          <>
            <section className="adm-card">
              <div className="adm-card-head">
                <h2>Credits</h2>
              </div>
              <div className="adm-card-body adm-form-grid">{CREDITS.map(numberField)}</div>
            </section>
            <section className="adm-card">
              <div className="adm-card-head">
                <h2>Booking rules</h2>
              </div>
              <div className="adm-card-body adm-form-grid">
                {RULES.map(numberField)}
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
          </>,
        )}

        {panel(
          'prices',
          <>
            <section className="adm-card">
              <div className="adm-card-head">
                <h2>Plans and prices</h2>
              </div>
              <div className="adm-card-body">
                <p className="adm-sub adm-intro">
                  In US dollars. A new price applies from the next charge: sign-ups, renewals and extra-session
                  purchases. What members already paid does not change. Credits per month and people per Household are
                  on the Booking tab.
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
                <h2>When a payment fails</h2>
              </div>
              <div className="adm-card-body adm-form-grid">{numberField(GRACE)}</div>
            </section>
          </>,
        )}

        {panel(
          'opening',
          <section className="adm-card">
            <div className="adm-card-head">
              <h2>Grand opening</h2>
            </div>
            <div className="adm-card-body adm-form">
              <label className="adm-field adm-field-narrow">
                <span>Opening date (Central time)</span>
                <input
                  className="adm-input"
                  type="datetime-local"
                  value={form.opens_at ? toCentralInput(form.opens_at) : ''}
                  onChange={(e) => set('opens_at', e.target.value === '' ? null : fromCentralInput(e.target.value))}
                />
                <small>
                  Until then every session shows as Full to visitors and to members whose Hello Video you have not
                  approved, so people who find the site cannot book. Members you approved see the real seats. Leave
                  empty to open the calendar to everyone.
                </small>
              </label>
            </div>
          </section>,
        )}

        {panel(
          'hello',
          <section className="adm-card">
            <div className="adm-card-head">
              <h2>{SMS_ON ? 'Hello Video and reminders' : 'Hello Video'}</h2>
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
              <div className="adm-form-grid">
                <label className="adm-field">
                  <span>Time to review a new Hello Video (hours)</span>
                  <input
                    className="adm-input"
                    type="number"
                    min={0}
                    max={168}
                    required
                    disabled={!form.require_hello_video}
                    value={form.hello_wait_hours}
                    onChange={(e) => set('hello_wait_hours', Number(e.target.value))}
                  />
                  <small>
                    Sessions starting sooner than this show as Full to people whose video is not approved yet. Once you
                    approve it, they see every session. 0 = off.
                  </small>
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
                    Shown on the Contact us button after a Hello Video is declined. Leave empty for no link. The Contact
                    us link in the footer and account menu always goes to hello@meetdoconnect.com.
                  </small>
                </label>
              </div>
              {SMS_ON && (
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
              )}
            </div>
          </section>,
        )}

        {panel(
          'connections',
          <section className="adm-card">
            <div className="adm-card-head">
              <h2>Connections</h2>
            </div>
            <div className="adm-card-body adm-form">
              <p className="adm-sub">
                Keys for the services the site uses. They are stored encrypted, and after saving only the last 4
                characters are shown. To change a key, paste the new one and save.
              </p>
              <ConnectionFields
                keys={keys}
                loading={keysLoading}
                typed={typed}
                removing={removing}
                disabled={saving}
                onType={(name, value) => {
                  setMsg(null);
                  setTyped({ ...typed, [name]: value });
                }}
                onToggleRemove={(name) => {
                  setMsg(null);
                  setRemoving(removing.includes(name) ? removing.filter((n) => n !== name) : [...removing, name]);
                }}
              />
            </div>
          </section>,
        )}

        <div className="adm-savebar" data-state={state}>
          <p className="adm-savebar-status" role="status" aria-live="polite">
            {statusText}
          </p>
          <div className="adm-toolbar">
            <button type="button" className="adm-btn" disabled={saving || !pending} onClick={undo}>
              Undo changes
            </button>
            <button type="submit" className="adm-btn adm-btn-primary" disabled={saving || !pending}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
