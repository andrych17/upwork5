'use client';

// Payment history and credit history for one member, inside the member panel. Read-only: it is built from the
// payments, credit_grants and bookings records, so it needs no extra table (lib/credit-history.ts).
import { useCallback } from 'react';
import { useAdmin } from '@/components/admin/shell';
import { fmtWhen, useLoad } from '@/lib/admin';
import { creditHistory, type BookingRow, type GrantRow, type PaymentRow } from '@/lib/credit-history';
import { money } from '@/lib/prices';

interface Props {
  id: string;
  /** Set for a Household person: their credits and plan belong to the account holder. */
  holderId: string | null;
  /** Changes when the member's credits change, so the lists reload after Give credits or a cancel. */
  stamp: string;
}

type Payment = PaymentRow & { id: string; amount_cents: number; provider: string };

const LIMIT = 40;

export default function MemberHistory({ id, holderId, stamp }: Props) {
  const { supabase } = useAdmin();

  const fetchHistory = useCallback(async () => {
    void stamp;
    const owner = holderId ?? id;
    let books = supabase
      .from('bookings')
      .select(
        'user_id,status,credit_type,created_at,cancelled_at,release_reason,session:sessions(title),' +
          'seat:profiles!bookings_user_id_fkey(first_name,last_name)',
      )
      .eq('charged_to', owner)
      .order('created_at', { ascending: false })
      .limit(LIMIT);
    if (holderId) books = books.eq('user_id', id);
    const [pay, grants, bookings] = await Promise.all([
      supabase
        .from('payments')
        .select('id,kind,description,amount_cents,provider,status,extra_sessions,refunded_at,refund_reason,created_at')
        .eq('profile_id', id)
        .order('created_at', { ascending: false })
        .limit(LIMIT),
      holderId
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .from('credit_grants')
            .select('amount,reason,created_at')
            .eq('profile_id', id)
            .order('created_at', { ascending: false })
            .limit(LIMIT),
      books,
    ]);
    const payments = (pay.data ?? []) as unknown as Payment[];
    return {
      payments,
      events: creditHistory(
        (grants.data ?? []) as GrantRow[],
        payments,
        (bookings.data ?? []) as unknown as BookingRow[],
        owner,
      ),
      error: Boolean(pay.error || grants.error || bookings.error),
    };
  }, [supabase, id, holderId, stamp]);

  const { data, loading } = useLoad(fetchHistory);

  if (!data) return <p className="adm-sub">{loading ? 'Loading history…' : ''}</p>;

  return (
    <>
      {data.error && (
        <p className="adm-msg adm-msg-error">Part of the history could not load. Reopen the member to try again.</p>
      )}

      <div className="adm-section">
        <h3>Payment history</h3>
        {data.payments.length === 0 ? (
          <p className="adm-sub">{holderId ? 'Payments are on the account holder.' : 'No payments yet.'}</p>
        ) : (
          <ul className="adm-list">
            {data.payments.map((p) => (
              <li key={p.id}>
                <span>
                  {p.description} · {money(p.amount_cents)}
                  <span className="adm-sub">
                    {fmtWhen(p.created_at)} · {p.provider === 'test' ? 'test payment' : p.provider}
                    {p.status === 'refunded' ? ` · refunded${p.refund_reason ? `: ${p.refund_reason}` : ''}` : ''}
                  </span>
                </span>
                <span className={p.status === 'refunded' ? 'adm-badge adm-badge-warn' : 'adm-badge adm-badge-good'}>
                  {p.status === 'refunded' ? 'Refunded' : 'Paid'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="adm-section">
        <h3>Credit history</h3>
        {data.events.length === 0 ? (
          <p className="adm-sub">No credit activity yet.</p>
        ) : (
          <ul className="adm-list">
            {data.events.map((e, i) => (
              <li key={`${e.at}-${i}`}>
                <span>
                  {e.label}
                  <span className="adm-sub">
                    {fmtWhen(e.at)}
                    {e.detail ? ` · ${e.detail}` : ''}
                  </span>
                </span>
                {e.delta !== null && (
                  <span
                    className={
                      e.delta > 0 ? 'adm-badge adm-badge-good' : e.delta < 0 ? 'adm-badge adm-badge-warn' : 'adm-badge'
                    }
                  >
                    {e.delta > 0 ? `+${e.delta}` : e.delta < 0 ? `−${-e.delta}` : '0'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="adm-sub" style={{ marginTop: '0.5rem' }}>
          Built from payments, gifts and bookings. Free-trial credits and the monthly reset are not listed, and monthly
          returns stop at the plan size. The current balance is under Credits above.
          {holderId ? ' Credits belong to the account holder, so only this person’s bookings are shown.' : ''}
        </p>
      </div>
    </>
  );
}
