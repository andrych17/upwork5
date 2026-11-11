'use client';

// Testers: people who signed up on /testers (schema section 37) and the test-week settings. Send code queues the
// free-week email; send-reminders sends it within five minutes. With "Send the code right away" on, new sign-ups
// skip the wait. Declined sign-ups free their spot. Delete is for spam.
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { DataTable, Pager, usePaging, type Column } from '@/components/admin/data-table';
import { FilterBar, SearchBox, TabFilter } from '@/components/admin/filters';
import { useAdmin } from '@/components/admin/shell';
import { adminRpc, fmtWhen, searchTerm, useLoad } from '@/lib/admin';
import { timeLabel, zoneLabel } from '@/lib/testers';

type Status = 'waiting' | 'queued' | 'sent' | 'failed' | 'declined';
type Tab = 'all' | 'waiting' | 'sent' | 'failed' | 'declined';

interface Signup {
  id: string;
  first_name: string;
  email: string;
  time_zone: string;
  interests: string[];
  times: string[];
  heard: string | null;
  note: string | null;
  status: Status;
  created_at: string;
  sent_at: string | null;
  error: string | null;
}

interface Settings {
  tester_form_open: boolean;
  tester_auto_code: boolean;
  tester_limit: number;
  test_week_start: string;
  test_week_end: string;
  tester_code: string;
}

const BADGE: Record<Status, [string, string]> = {
  waiting: ['Waiting for you', 'adm-badge adm-badge-warn'],
  queued: ['Sending', 'adm-badge adm-badge-accent'],
  sent: ['Code sent', 'adm-badge adm-badge-good'],
  failed: ['Not sent', 'adm-badge adm-badge-bad'],
  declined: ['Declined', 'adm-badge'],
};

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'sent', label: 'Code sent' },
  { key: 'failed', label: 'Not sent' },
  { key: 'declined', label: 'Declined' },
];

const SIGNUP_COLUMNS = 'id,first_name,email,time_zone,interests,times,heard,note,status,created_at,sent_at,error';

export default function AdminTesters() {
  const { supabase, refreshCounts } = useAdmin();
  const paging = usePaging();
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const fetchSignups = useCallback(async () => {
    let q = supabase
      .from('tester_signups')
      .select(SIGNUP_COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(paging.page * paging.size, paging.page * paging.size + paging.size - 1);
    // A code that is about to go out counts as waiting until it is sent.
    if (tab === 'waiting') q = q.in('status', ['waiting', 'queued']);
    else if (tab !== 'all') q = q.eq('status', tab);
    const term = searchTerm(search);
    if (term) q = q.or(`first_name.ilike.*${term}*,email.ilike.*${term}*`);
    const [list, taken, waiting] = await Promise.all([
      q,
      supabase.from('tester_signups').select('id', { count: 'exact', head: true }).neq('status', 'declined'),
      supabase.from('tester_signups').select('id', { count: 'exact', head: true }).eq('status', 'waiting'),
    ]);
    return {
      rows: (list.data ?? []) as Signup[],
      count: list.count ?? 0,
      taken: taken.count ?? 0,
      waiting: waiting.count ?? 0,
      error: Boolean(list.error),
    };
  }, [supabase, tab, search, paging.page, paging.size]);

  const { data: result, loading, reload } = useLoad(fetchSignups);
  const rows = result?.rows ?? [];

  const done = (ok: boolean, text: string) => {
    setMsg({ text, error: !ok });
    if (ok) {
      reload();
      refreshCounts();
    }
  };

  const act = async (row: Signup, action: 'send' | 'decline' | 'delete') => {
    if (action === 'delete' && !window.confirm(`Delete ${row.first_name} (${row.email})? Use this for spam only.`))
      return;
    setBusy(true);
    const res = await adminRpc(supabase, 'admin_tester_action', { p_id: row.id, p_action: action });
    setBusy(false);
    const text = {
      send: `The code goes to ${row.email} within five minutes.`,
      decline: `${row.first_name} was declined. Their spot is free again.`,
      delete: `${row.first_name} was deleted.`,
    }[action];
    done(res.ok, res.ok ? text : res.error);
  };

  const sendWaiting = async () => {
    const n = result?.waiting ?? 0;
    if (!window.confirm(`Send the free-week code to ${n} ${n === 1 ? 'person' : 'people'} waiting?`)) return;
    setBusy(true);
    const res = await adminRpc(supabase, 'admin_tester_send_waiting', {});
    setBusy(false);
    const count = Number(res.data.count ?? 0);
    done(
      res.ok,
      res.ok ? `${count} code ${count === 1 ? 'email goes' : 'emails go'} out within five minutes.` : res.error,
    );
  };

  const columns: Column<Signup>[] = [
    {
      header: 'Tester',
      cell: (r) => (
        <>
          <strong>{r.first_name}</strong>
          <span className="adm-sub adm-tester-email">{r.email}</span>
        </>
      ),
    },
    {
      header: 'Can come',
      cell: (r) => (
        <>
          {r.times.map(timeLabel).join(', ')}
          <span className="adm-sub">{zoneLabel(r.time_zone)}</span>
        </>
      ),
    },
    {
      header: 'Interested in',
      cell: (r) => (
        <>
          {r.interests.join(', ')}
          {r.heard && <span className="adm-sub">Heard from: {r.heard}</span>}
          {r.note && <span className="adm-sub">“{r.note}”</span>}
        </>
      ),
    },
    {
      header: 'Status',
      cell: (r) => (
        <>
          <span className={BADGE[r.status][1]}>{BADGE[r.status][0]}</span>
          <span className="adm-sub">
            {r.status === 'sent' && r.sent_at ? `Sent ${fmtWhen(r.sent_at)}` : `Joined ${fmtWhen(r.created_at)}`}
          </span>
          {r.status === 'failed' && r.error && <span className="adm-sub">{r.error}</span>}
        </>
      ),
    },
    {
      header: '',
      align: 'right',
      cell: (r) => (
        <div className="adm-row-actions">
          {r.status !== 'queued' && (
            <button type="button" className="adm-btn adm-btn-sm" disabled={busy} onClick={() => void act(r, 'send')}>
              {r.status === 'sent' ? 'Send again' : r.status === 'failed' ? 'Try again' : 'Send code'}
            </button>
          )}
          {r.status !== 'sent' && r.status !== 'declined' && (
            <button type="button" className="adm-btn adm-btn-sm" disabled={busy} onClick={() => void act(r, 'decline')}>
              Decline
            </button>
          )}
          <button
            type="button"
            className="adm-btn adm-btn-sm adm-btn-danger"
            disabled={busy}
            onClick={() => void act(r, 'delete')}
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  const waiting = result?.waiting ?? 0;

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Testers</h1>
          <p>
            Sign-ups from the <Link href="/testers">tester form</Link>. Send code emails the free-week code; Decline
            frees the spot.
          </p>
        </div>
        <button
          type="button"
          className="adm-btn adm-btn-primary"
          disabled={busy || waiting === 0}
          onClick={() => void sendWaiting()}
        >
          Send code to everyone waiting{waiting > 0 ? ` (${waiting})` : ''}
        </button>
      </header>
      {result?.error && <p className="adm-msg adm-msg-error">Could not load the sign-ups. Refresh to try again.</p>}
      {msg && <p className={msg.error ? 'adm-msg adm-msg-error' : 'adm-msg'}>{msg.text}</p>}

      <TesterSettings taken={result?.taken ?? 0} onSaved={reload} />

      <section className="adm-card adm-testers-list">
        <FilterBar
          onReset={
            tab !== 'all' || search
              ? () => {
                  setTab('all');
                  setSearch('');
                  paging.reset();
                }
              : undefined
          }
        >
          <TabFilter
            label="Status"
            value={tab}
            options={TABS}
            onChange={(t) => {
              setTab(t);
              paging.reset();
            }}
          />
          <SearchBox
            label="Search testers"
            placeholder="Name or email"
            value={search}
            onSearch={(text) => {
              setSearch(text);
              paging.reset();
            }}
          />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={loading}
          empty={tab === 'all' && !search ? 'No one has signed up yet.' : 'No sign-ups match these filters.'}
        />
        <Pager
          page={paging.page}
          size={paging.size}
          total={result?.count ?? 0}
          noun={['sign-up', 'sign-ups']}
          loading={loading}
          onPage={paging.setPage}
          onSize={paging.setSize}
        />
      </section>
    </>
  );
}

function TesterSettings({ taken, onSaved }: { taken: number; onSaved: () => void }) {
  const { supabase } = useAdmin();
  const [form, setForm] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    void Promise.all([
      supabase
        .from('app_config')
        .select('tester_form_open,tester_auto_code,tester_limit,test_week_start,test_week_end')
        .eq('id', 1)
        .maybeSingle(),
      supabase.from('tester_secret').select('code').eq('id', 1).maybeSingle(),
    ]).then(([cfg, secret]) => {
      if (!live) return;
      if (cfg.error || secret.error || !cfg.data || !secret.data) {
        setMsg({ text: 'Could not load the tester settings. Run the testers SQL first, then refresh.', error: true });
        return;
      }
      setForm({ ...(cfg.data as Omit<Settings, 'tester_code'>), tester_code: (secret.data as { code: string }).code });
    });
    return () => {
      live = false;
    };
  }, [supabase]);

  if (!form) {
    return msg ? <p className="adm-msg adm-msg-error">{msg.text}</p> : null;
  }

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setForm({ ...form, [key]: value });
    setMsg(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const res = await adminRpc(supabase, 'admin_tester_settings', { p: form });
    setSaving(false);
    setMsg({ text: res.ok ? 'Saved.' : res.error, error: !res.ok });
    if (res.ok) onSaved();
  };

  return (
    <form className="adm-card" onSubmit={(e) => void save(e)}>
      <div className="adm-card-head">
        <h2>Tester form</h2>
        <span className={form.tester_form_open ? 'adm-badge adm-badge-good' : 'adm-badge'}>
          {form.tester_form_open ? `Open · ${taken} of ${form.tester_limit} spots taken` : 'Closed'}
        </span>
      </div>
      <div className="adm-card-body adm-form">
        <label className="adm-check">
          <input
            type="checkbox"
            checked={form.tester_form_open}
            onChange={(e) => set('tester_form_open', e.target.checked)}
          />
          Take sign-ups (the form closes by itself once every spot is taken)
        </label>
        <label className="adm-check">
          <input
            type="checkbox"
            checked={form.tester_auto_code}
            onChange={(e) => set('tester_auto_code', e.target.checked)}
          />
          Send the code right away, without waiting for Send code
        </label>
        <div className="adm-form-grid">
          <label className="adm-field">
            <span>Spots</span>
            <input
              className="adm-input"
              type="number"
              min={1}
              max={500}
              required
              value={form.tester_limit}
              onChange={(e) => set('tester_limit', Number(e.target.value))}
            />
          </label>
          <label className="adm-field">
            <span>Free-week code</span>
            <input
              className="adm-input"
              type="text"
              required
              maxLength={20}
              pattern="[A-Z0-9]{3,20}"
              title="3 to 20 letters or numbers"
              value={form.tester_code}
              onChange={(e) => set('tester_code', e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
            />
            <small>Only in the email, never shown on the site.</small>
          </label>
          <label className="adm-field">
            <span>Test week starts</span>
            <input
              className="adm-input"
              type="date"
              required
              value={form.test_week_start}
              onChange={(e) => set('test_week_start', e.target.value)}
            />
          </label>
          <label className="adm-field">
            <span>Test week ends</span>
            <input
              className="adm-input"
              type="date"
              required
              min={form.test_week_start}
              value={form.test_week_end}
              onChange={(e) => set('test_week_end', e.target.value)}
            />
          </label>
        </div>
        <div className="adm-toolbar">
          <button type="submit" className="adm-btn adm-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {msg && (
            <span className={msg.error ? 'adm-msg adm-msg-error' : 'adm-msg'} role="status">
              {msg.text}
            </span>
          )}
        </div>
      </div>
    </form>
  );
}
