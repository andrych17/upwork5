'use client';

// Usage: this month's Daily video minutes and Resend emails next to the plan limits (schema section 28).
// The numbers are estimates from our own database. The providers' dashboards show what they actually bill.
import { useCallback, useState } from 'react';
import { useAdmin } from '@/components/admin/shell';
import { adminRpc, fmtDate, useLoad } from '@/lib/admin';
import { level } from '@/lib/usage-level';

interface Usage {
  month_start: string;
  daily_minutes: number;
  daily_limit: number;
  resend_emails: number;
  resend_limit: number;
}

type Loaded = { usage: Usage | null; error: boolean };

const BADGE = {
  none: 'adm-badge',
  good: 'adm-badge adm-badge-good',
  warn: 'adm-badge adm-badge-warn',
  bad: 'adm-badge adm-badge-bad',
};

const n = (v: number) => v.toLocaleString('en-US');

function Meter({
  title,
  unit,
  used,
  limit,
  note,
}: {
  title: string;
  unit: string;
  used: number;
  limit: number;
  note: string;
}) {
  const l = level(used, limit);
  return (
    <section className="adm-card">
      <div className="adm-card-head">
        <h2>{title}</h2>
        <span className={BADGE[l.tone]}>{l.label}</span>
      </div>
      <div className="adm-card-body">
        <p className="adm-usage-figure">
          <strong>{n(used)}</strong> of {limit > 0 ? n(limit) : '—'} {unit} · {l.pct}%
        </p>
        <div
          className={`adm-meter adm-meter-${l.tone}`}
          role="progressbar"
          aria-label={title}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, l.pct)}
        >
          <span style={{ width: `${Math.min(100, l.pct)}%` }} />
        </div>
        <p className="adm-sub">{note}</p>
      </div>
    </section>
  );
}

export default function AdminUsage() {
  const { supabase } = useAdmin();
  const [edits, setEdits] = useState<{ daily: number; resend: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const fetchUsage = useCallback(async (): Promise<Loaded> => {
    const res = await adminRpc(supabase, 'admin_usage', {});
    return { usage: res.ok ? (res.data as unknown as Usage) : null, error: !res.ok };
  }, [supabase]);

  const { data, loading, reload } = useLoad(fetchUsage);
  const usage = data?.usage ?? null;

  if (!usage) {
    return (
      <>
        <header className="adm-head">
          <div>
            <h1>Usage</h1>
          </div>
        </header>
        {loading ? (
          <p className="adm-empty">Loading…</p>
        ) : (
          <p className="adm-msg adm-msg-error">Could not load usage. Refresh to try again.</p>
        )}
      </>
    );
  }

  const form = edits ?? { daily: usage.daily_limit, resend: usage.resend_limit };
  const dirty = form.daily !== usage.daily_limit || form.resend !== usage.resend_limit;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await adminRpc(supabase, 'admin_save_usage_limits', { p_daily: form.daily, p_resend: form.resend });
    setBusy(false);
    setMsg({ text: res.ok ? 'Limits saved.' : res.error, error: !res.ok });
    if (res.ok) {
      setEdits(null);
      reload();
    }
  };

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Usage</h1>
          <p>
            Since {fmtDate(usage.month_start)}. Estimates from this site&rsquo;s own records, so check the Daily and
            Resend dashboards for what they bill.
          </p>
        </div>
      </header>
      {msg && <p className={msg.error ? 'adm-msg adm-msg-error' : 'adm-msg'}>{msg.text}</p>}

      <div className="adm-usage-grid">
        <Meter
          title="Daily video minutes"
          unit="minutes"
          used={usage.daily_minutes}
          limit={usage.daily_limit}
          note="Counted per member, from joining until the session ends. A full session of 12 is 720 minutes. Admins who join without a seat are not counted."
        />
        <Meter
          title="Resend emails"
          unit="emails"
          used={usage.resend_emails}
          limit={usage.resend_limit}
          note="Session reminder emails only. Sign-up code and password emails also use Resend and are not counted here."
        />
      </div>

      <form onSubmit={save}>
        <section className="adm-card">
          <div className="adm-card-head">
            <h2>Plan limits</h2>
          </div>
          <div className="adm-card-body adm-form-grid">
            <label className="adm-field">
              <span>Daily minutes per month</span>
              <input
                className="adm-input"
                type="number"
                min={0}
                max={10000000}
                required
                value={form.daily}
                onChange={(e) => setEdits({ ...form, daily: Number(e.target.value) })}
              />
              <small>The free allowance on Daily is 10,000. Change it if the plan changes.</small>
            </label>
            <label className="adm-field">
              <span>Resend emails per month</span>
              <input
                className="adm-input"
                type="number"
                min={0}
                max={10000000}
                required
                value={form.resend}
                onChange={(e) => setEdits({ ...form, resend: Number(e.target.value) })}
              />
              <small>Copy this from the Resend plan. Set 0 to turn the warning off.</small>
            </label>
          </div>
        </section>
        <div className="adm-toolbar">
          <button type="submit" className="adm-btn adm-btn-primary" disabled={busy || !dirty}>
            Save limits
          </button>
          <button type="button" className="adm-btn" disabled={busy || !dirty} onClick={() => setEdits(null)}>
            Undo changes
          </button>
        </div>
      </form>
    </>
  );
}
