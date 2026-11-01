'use client';

// Sessions: list upcoming or past rooms, create and edit them, hide or delete unused ones.
import { useCallback, useState } from 'react';
import { useAdmin } from '@/components/admin/shell';
import { adminRpc, fmtWhen, fromCentralInput, revealPanel, toCentralInput, useLoad } from '@/lib/admin';

interface Session {
  id: string;
  title: string;
  blurb: string | null;
  host: string;
  prep: string | null;
  starts_at: string;
  minutes: number;
  capacity: number;
  published: boolean;
  bookings: { count: number }[];
}

interface Draft {
  id: string | null;
  title: string;
  blurb: string;
  host: string;
  prep: string;
  start: string;
  minutes: number;
  capacity: number;
  published: boolean;
}

const EMPTY: Draft = {
  id: null,
  title: '',
  blurb: '',
  host: 'Kelly C.',
  prep: '',
  start: '',
  minutes: 60,
  capacity: 12,
  published: true,
};

const toDraft = (s: Session): Draft => ({
  id: s.id,
  title: s.title,
  blurb: s.blurb ?? '',
  host: s.host,
  prep: s.prep ?? '',
  start: toCentralInput(s.starts_at),
  minutes: s.minutes,
  capacity: s.capacity,
  published: s.published,
});

export default function AdminSessions() {
  const { supabase } = useAdmin();
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const fetchSessions = useCallback(async () => {
    const now = new Date().toISOString();
    let q = supabase
      .from('sessions')
      .select('id,title,blurb,host,prep,starts_at,minutes,capacity,published,bookings(count)')
      .eq('bookings.status', 'confirmed')
      .limit(60);
    q = when === 'upcoming' ? q.gte('starts_at', now).order('starts_at') : q.lt('starts_at', now).order('starts_at', { ascending: false });
    const { data, error } = await q;
    return { rows: (data ?? []) as Session[], error: Boolean(error) };
  }, [supabase, when]);

  const { data: result, loading, reload } = useLoad(fetchSessions);
  const rows = result?.rows ?? [];

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const startsAt = fromCentralInput(draft.start);
    if (!startsAt) {
      setMsg({ text: 'Pick a start date and time.', error: true });
      return;
    }
    setBusy(true);
    const res = await adminRpc(supabase, 'admin_save_session', {
      p_id: draft.id,
      p_title: draft.title,
      p_blurb: draft.blurb || null,
      p_host: draft.host || null,
      p_prep: draft.prep || null,
      p_starts_at: startsAt,
      p_minutes: draft.minutes,
      p_capacity: draft.capacity,
      p_published: draft.published,
    });
    setBusy(false);
    setMsg({ text: res.ok ? (draft.id ? 'Session saved.' : 'Session created.') : res.error, error: !res.ok });
    if (res.ok) {
      setDraft(null);
      reload();
    }
  };

  const remove = async () => {
    if (!draft?.id || !window.confirm(`Delete "${draft.title}"? This cannot be undone.`)) return;
    setBusy(true);
    const res = await adminRpc(supabase, 'admin_delete_session', { p_id: draft.id });
    setBusy(false);
    setMsg({ text: res.ok ? 'Session deleted.' : res.error, error: !res.ok });
    if (res.ok) {
      setDraft(null);
      reload();
    }
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => draft && setDraft({ ...draft, [key]: value });

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Sessions</h1>
          <p>Times are Central (America/Chicago). Members see them in their own time zone.</p>
        </div>
        <button
          type="button"
          className="adm-btn adm-btn-primary"
          onClick={() => {
            setMsg(null);
            setDraft({ ...EMPTY });
          }}
        >
          New session
        </button>
      </header>
      {result?.error && <p className="adm-msg adm-msg-error">Could not load sessions. Refresh to try again.</p>}
      {msg && <p className={msg.error ? 'adm-msg adm-msg-error' : 'adm-msg'}>{msg.text}</p>}
      <div className={draft ? 'adm-split' : undefined}>
        <section className="adm-card">
          <div className="adm-card-head">
            <div className="adm-tabs" role="group" aria-label="Which sessions">
              <button type="button" aria-pressed={when === 'upcoming'} onClick={() => setWhen('upcoming')}>
                Upcoming
              </button>
              <button type="button" aria-pressed={when === 'past'} onClick={() => setWhen('past')}>
                Past
              </button>
            </div>
          </div>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Starts</th>
                  <th>Seats</th>
                  <th>Shown</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr
                    key={s.id}
                    className="adm-row-click"
                    aria-selected={draft?.id === s.id}
                    tabIndex={0}
                    onClick={() => {
                      setMsg(null);
                      setDraft(toDraft(s));
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && setDraft(toDraft(s))}
                  >
                    <td>
                      <strong>{s.title}</strong>
                      <span className="adm-sub">
                        {s.host} · {s.minutes} min
                      </span>
                    </td>
                    <td>{fmtWhen(s.starts_at)}</td>
                    <td>
                      {s.bookings[0]?.count ?? 0} of {s.capacity}
                    </td>
                    <td>
                      {s.published ? (
                        <span className="adm-badge adm-badge-good">Published</span>
                      ) : (
                        <span className="adm-badge">Hidden</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && rows.length === 0 && <p className="adm-empty">No {when} sessions.</p>}
          </div>
        </section>

        {draft && (
          <aside
            key={draft.id ?? 'new'}
            ref={revealPanel}
            className="adm-card adm-panel"
            aria-label={draft.id ? 'Edit session' : 'New session'}
          >
            <div className="adm-card-head">
              <h2>{draft.id ? 'Edit session' : 'New session'}</h2>
              <button type="button" className="adm-btn adm-btn-sm" onClick={() => setDraft(null)}>
                Close
              </button>
            </div>
            <form className="adm-form adm-card-body" onSubmit={save}>
              <label className="adm-field">
                <span>Title</span>
                <input
                  className="adm-input"
                  required
                  maxLength={120}
                  value={draft.title}
                  onChange={(e) => set('title', e.target.value)}
                />
              </label>
              <label className="adm-field">
                <span>Starts (Central time)</span>
                <input
                  className="adm-input"
                  type="datetime-local"
                  required
                  value={draft.start}
                  onChange={(e) => set('start', e.target.value)}
                />
              </label>
              <div className="adm-form-grid">
                <label className="adm-field">
                  <span>Minutes</span>
                  <input
                    className="adm-input"
                    type="number"
                    min={15}
                    max={240}
                    step={5}
                    required
                    value={draft.minutes}
                    onChange={(e) => set('minutes', Number(e.target.value))}
                  />
                </label>
                <label className="adm-field">
                  <span>Seats</span>
                  <input
                    className="adm-input"
                    type="number"
                    min={1}
                    max={12}
                    required
                    value={draft.capacity}
                    onChange={(e) => set('capacity', Number(e.target.value))}
                  />
                </label>
              </div>
              <label className="adm-field">
                <span>Host</span>
                <input className="adm-input" maxLength={80} value={draft.host} onChange={(e) => set('host', e.target.value)} />
              </label>
              <label className="adm-field">
                <span>Description</span>
                <textarea
                  className="adm-textarea"
                  rows={3}
                  maxLength={500}
                  value={draft.blurb}
                  onChange={(e) => set('blurb', e.target.value)}
                />
              </label>
              <label className="adm-field">
                <span>Prep notes</span>
                <textarea
                  className="adm-textarea"
                  rows={2}
                  maxLength={500}
                  value={draft.prep}
                  onChange={(e) => set('prep', e.target.value)}
                />
              </label>
              <label className="adm-check">
                <input type="checkbox" checked={draft.published} onChange={(e) => set('published', e.target.checked)} />
                Published (members can see and book it)
              </label>
              <div className="adm-toolbar">
                <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>
                  {draft.id ? 'Save' : 'Create'}
                </button>
                {draft.id && (
                  <button type="button" className="adm-btn adm-btn-danger" disabled={busy} onClick={remove}>
                    Delete
                  </button>
                )}
              </div>
              {draft.id && (
                <small className="adm-sub">
                  Only a session nobody has booked can be deleted. Otherwise hide it, or cancel its bookings first.
                </small>
              )}
            </form>
          </aside>
        )}
      </div>
    </>
  );
}
