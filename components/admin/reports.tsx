'use client';

// Reports: private reports members sent from a live room (schema section 25). Only admins see them; the
// reported person is never told. Resolve when handled (talk to them, turn the account off from Members).
import { useCallback, useState } from 'react';
import { useAdmin } from '@/components/admin/shell';
import { adminRpc, fmtWhen, fullName, useLoad } from '@/lib/admin';

type Who = { first_name: string | null; last_name: string | null; email: string | null } | null;

interface Report {
  id: string;
  reason: string;
  note: string | null;
  status: 'open' | 'resolved';
  created_at: string;
  resolved_at: string | null;
  session: { title: string; starts_at: string } | null;
  reporter: Who;
  reported: Who;
}

export default function AdminReports() {
  const { supabase, refreshCounts } = useAdmin();
  const [status, setStatus] = useState<'open' | 'resolved'>('open');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const fetchReports = useCallback(async () => {
    const { data, error } = await supabase
      .from('room_reports')
      .select(
        'id,reason,note,status,created_at,resolved_at,session:sessions(title,starts_at),' +
          'reporter:profiles!room_reports_reporter_id_fkey(first_name,last_name,email),' +
          'reported:profiles!room_reports_reported_id_fkey(first_name,last_name,email)',
      )
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(100);
    return { rows: (data ?? []) as unknown as Report[], error: Boolean(error) };
  }, [supabase, status]);

  const { data: result, loading, reload } = useLoad(fetchReports);
  const rows = result?.rows ?? [];

  const resolve = async (r: Report) => {
    setBusy(true);
    const res = await adminRpc(supabase, 'admin_resolve_report', { p_id: r.id });
    setBusy(false);
    setMsg({ text: res.ok ? 'Marked as resolved.' : res.error, error: !res.ok });
    if (res.ok) {
      reload();
      refreshCounts();
    }
  };

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Reports</h1>
          <p>Private reports from live rooms. The person reported is never told who reported them.</p>
        </div>
        <div className="adm-tabs" role="group" aria-label="Status">
          {(['open', 'resolved'] as const).map((s) => (
            <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>
              {s === 'open' ? 'Open' : 'Resolved'}
            </button>
          ))}
        </div>
      </header>
      {result?.error && <p className="adm-msg adm-msg-error">Could not load reports. Refresh to try again.</p>}
      {msg && <p className={msg.error ? 'adm-msg adm-msg-error' : 'adm-msg'}>{msg.text}</p>}
      <section className="adm-card">
        {!loading && rows.length === 0 ? (
          <p className="adm-empty">{status === 'open' ? 'No open reports.' : 'Nothing resolved yet.'}</p>
        ) : (
          <ul className="adm-list adm-card-body">
            {rows.map((r) => (
              <li key={r.id}>
                <span>
                  {r.reported ? fullName(r.reported) : 'Someone'} · {r.reason}
                  <span className="adm-sub">
                    {r.session ? `${r.session.title}, ${fmtWhen(r.session.starts_at)}` : 'Session removed'} · reported
                    by {r.reporter ? fullName(r.reporter) : 'a member'} {fmtWhen(r.created_at)}
                    {r.note ? ` · “${r.note}”` : ''}
                  </span>
                </span>
                {r.status === 'open' ? (
                  <button type="button" className="adm-btn adm-btn-sm" disabled={busy} onClick={() => void resolve(r)}>
                    Resolve
                  </button>
                ) : (
                  <span className="adm-badge adm-badge-good">Resolved</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
