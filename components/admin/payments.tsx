'use client';

// Payments: every checkout, renewal and extra-session purchase (schema sections 23-24), newest first, with
// Refund. In test mode nothing was charged, so a refund only marks the receipt and takes back unused extras;
// once a processor is connected, the money itself is refunded in its dashboard.
import { useCallback, useState } from 'react';
import { useAdmin } from '@/components/admin/shell';
import { adminRpc, fmtWhen, fullName, PAGE_SIZE, useLoad } from '@/lib/admin';
import { money } from '@/lib/prices';

interface Payment {
  id: string;
  kind: 'plan' | 'extras';
  description: string;
  amount_cents: number;
  provider: string;
  status: 'paid' | 'refunded';
  refund_reason: string | null;
  created_at: string;
  member: { first_name: string | null; last_name: string | null; email: string | null } | null;
}

type Filter = 'all' | 'paid' | 'refunded';

export default function AdminPayments() {
  const { supabase } = useAdmin();
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const fetchPayments = useCallback(async () => {
    let q = supabase
      .from('payments')
      .select(
        'id,kind,description,amount_cents,provider,status,refund_reason,created_at,' +
          'member:profiles!payments_profile_id_fkey(first_name,last_name,email)',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (filter !== 'all') q = q.eq('status', filter);
    const { data, error, count } = await q;
    return { rows: (data ?? []) as unknown as Payment[], count: count ?? 0, error: Boolean(error) };
  }, [supabase, filter, page]);

  const { data: result, loading, reload } = useLoad(fetchPayments);
  const rows = result?.rows ?? [];
  const pages = Math.max(1, Math.ceil((result?.count ?? 0) / PAGE_SIZE));

  const refund = async (p: Payment) => {
    const who = p.member ? fullName(p.member) : 'this member';
    const extra = p.kind === 'extras' ? ' Unused extra sessions from this purchase are taken back.' : '';
    const reason = window.prompt(`Refund ${money(p.amount_cents)} to ${who} (${p.description})?${extra} Reason:`);
    if (!reason?.trim()) return;
    setBusy(true);
    const res = await adminRpc(supabase, 'admin_refund_payment', { p_payment: p.id, p_reason: reason });
    setBusy(false);
    const taken = Number(res.data.extras_taken_back ?? 0);
    setMsg({
      text: res.ok
        ? `Marked as refunded${taken ? `, ${taken} extra ${taken === 1 ? 'session' : 'sessions'} taken back` : ''}.` +
          (p.provider === 'test' ? ' Test payment: no money moved.' : ' Refund the money in the payment processor too.')
        : res.error,
      error: !res.ok,
    });
    if (res.ok) reload();
  };

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Payments</h1>
          <p>Memberships, renewals and extra sessions. Test payments are marked “Test”: no card was charged.</p>
        </div>
        <div className="adm-tabs" role="group" aria-label="Filter">
          {(['all', 'paid', 'refunded'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => {
                setFilter(f);
                setPage(0);
              }}
            >
              {f === 'all' ? 'All' : f === 'paid' ? 'Paid' : 'Refunded'}
            </button>
          ))}
        </div>
      </header>
      {result?.error && <p className="adm-msg adm-msg-error">Could not load payments. Refresh to try again.</p>}
      {msg && <p className={msg.error ? 'adm-msg adm-msg-error' : 'adm-msg'}>{msg.text}</p>}
      <section className="adm-card">
        {!loading && rows.length === 0 ? (
          <p className="adm-empty">No payments here yet.</p>
        ) : (
          <ul className="adm-list adm-card-body">
            {rows.map((p) => (
              <li key={p.id}>
                <span>
                  {p.member ? fullName(p.member) : 'Member'} · {p.description}
                  <span className="adm-sub">
                    {fmtWhen(p.created_at)} · {money(p.amount_cents)}
                    {p.provider === 'test' ? ' · Test' : ''}
                    {p.status === 'refunded' ? ` · Refunded${p.refund_reason ? `: ${p.refund_reason}` : ''}` : ''}
                  </span>
                </span>
                {p.status === 'paid' ? (
                  <button
                    type="button"
                    className="adm-btn adm-btn-sm adm-btn-danger"
                    disabled={busy}
                    onClick={() => void refund(p)}
                  >
                    Refund
                  </button>
                ) : (
                  <span className="adm-badge adm-badge-bad">Refunded</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {pages > 1 && (
        <div className="adm-tabs" role="group" aria-label="Pages">
          <button type="button" disabled={page === 0} onClick={() => setPage((n) => n - 1)}>
            Newer
          </button>
          <button type="button" aria-pressed>
            {page + 1} of {pages}
          </button>
          <button type="button" disabled={page + 1 >= pages} onClick={() => setPage((n) => n + 1)}>
            Older
          </button>
        </div>
      )}
    </>
  );
}
