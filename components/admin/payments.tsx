'use client';

// Payments: every checkout, renewal and extra-session purchase (schema sections 23-24), newest first, with
// Refund. In test mode nothing was charged, so a refund only marks the receipt and takes back unused extras;
// once a processor is connected, the money itself is refunded in its dashboard.
import { useCallback, useState } from 'react';
import { DataTable, Pager, usePaging, type Column } from '@/components/admin/data-table';
import { DateRange, FilterBar, SearchBox, SelectFilter, TabFilter } from '@/components/admin/filters';
import { useAdmin } from '@/components/admin/shell';
import { adminRpc, fmtWhen, fromCentralInput, fullName, searchTerm, useLoad } from '@/lib/admin';
import { nextDay } from '@/lib/date-range';
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
type Kind = 'all' | 'plan' | 'extras';

const STATUS_TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'paid', label: 'Paid' },
  { key: 'refunded', label: 'Refunded' },
];

const KINDS: { key: Kind; label: string }[] = [
  { key: 'all', label: 'Any payment' },
  { key: 'plan', label: 'Membership' },
  { key: 'extras', label: 'Extra sessions' },
];

export default function AdminPayments() {
  const { supabase } = useAdmin();
  const paging = usePaging();
  const [filter, setFilter] = useState<Filter>('all');
  const [kind, setKind] = useState<Kind>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const fetchPayments = useCallback(async () => {
    const term = searchTerm(search);
    // !inner makes the member search drop the payments of everyone else instead of blanking their name
    let q = supabase
      .from('payments')
      .select(
        'id,kind,description,amount_cents,provider,status,refund_reason,created_at,' +
          `member:profiles!payments_profile_id_fkey${term ? '!inner' : ''}(first_name,last_name,email)`,
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(paging.page * paging.size, paging.page * paging.size + paging.size - 1);
    if (filter !== 'all') q = q.eq('status', filter);
    if (kind !== 'all') q = q.eq('kind', kind);
    if (from) q = q.gte('created_at', fromCentralInput(`${from}T00:00`) ?? '');
    if (to) q = q.lt('created_at', fromCentralInput(`${nextDay(to)}T00:00`) ?? '');
    if (term) {
      q = q.or(`first_name.ilike.*${term}*,last_name.ilike.*${term}*,email.ilike.*${term}*`, {
        referencedTable: 'member',
      });
    }
    const { data, error, count } = await q;
    return { rows: (data ?? []) as unknown as Payment[], count: count ?? 0, error: Boolean(error) };
  }, [supabase, filter, kind, from, to, search, paging.page, paging.size]);

  const { data: result, loading, reload } = useLoad(fetchPayments);
  const rows = result?.rows ?? [];
  const filtered = filter !== 'all' || kind !== 'all' || from !== '' || to !== '' || search !== '';
  const change =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      paging.reset();
    };
  const reset = () => {
    setFilter('all');
    setKind('all');
    setFrom('');
    setTo('');
    setSearch('');
    paging.reset();
  };

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

  const columns: Column<Payment>[] = [
    {
      header: 'Member',
      cell: (p) => (
        <>
          <strong>{p.member ? fullName(p.member) : 'Member'}</strong>
          <span className="adm-sub">{p.member?.email}</span>
        </>
      ),
    },
    {
      header: 'Payment',
      cell: (p) => (
        <>
          {p.description}
          <span className="adm-sub">
            {p.kind === 'plan' ? 'Membership' : 'Extra sessions'}
            {p.provider === 'test' ? ' · Test' : ''}
          </span>
        </>
      ),
    },
    { header: 'Date', width: '11rem', cell: (p) => fmtWhen(p.created_at) },
    { header: 'Amount', align: 'right', width: '6rem', cell: (p) => money(p.amount_cents) },
    {
      header: 'Status',
      width: '9rem',
      cell: (p) =>
        p.status === 'paid' ? (
          <span className="adm-badge adm-badge-good">Paid</span>
        ) : (
          <>
            <span className="adm-badge adm-badge-bad">Refunded</span>
            {p.refund_reason && <span className="adm-sub">{p.refund_reason}</span>}
          </>
        ),
    },
    {
      header: '',
      align: 'right',
      width: '7rem',
      cell: (p) =>
        p.status === 'paid' ? (
          <button
            type="button"
            className="adm-btn adm-btn-sm adm-btn-danger"
            disabled={busy}
            onClick={() => void refund(p)}
          >
            Refund
          </button>
        ) : null,
    },
  ];

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Payments</h1>
          <p>Memberships, renewals and extra sessions. Test payments are marked “Test”: no card was charged.</p>
        </div>
      </header>
      {result?.error && <p className="adm-msg adm-msg-error">Could not load payments. Refresh to try again.</p>}
      {msg && <p className={msg.error ? 'adm-msg adm-msg-error' : 'adm-msg'}>{msg.text}</p>}
      <section className="adm-card">
        <FilterBar onReset={filtered ? reset : undefined}>
          <TabFilter label="Status" value={filter} options={STATUS_TABS} onChange={change(setFilter)} />
          <SelectFilter label="Type" value={kind} options={KINDS} onChange={change(setKind)} />
          <DateRange
            from={from}
            to={to}
            onChange={(f, t) => {
              setFrom(f);
              setTo(t);
              paging.reset();
            }}
          />
          <SearchBox
            label="Search members"
            placeholder="Member name or email"
            value={search}
            onSearch={change(setSearch)}
          />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(p) => p.id}
          loading={loading}
          empty={filtered ? 'No payments match these filters.' : 'No payments here yet.'}
        />
        <Pager
          page={paging.page}
          size={paging.size}
          total={result?.count ?? 0}
          noun={['payment', 'payments']}
          loading={loading}
          onPage={paging.setPage}
          onSize={paging.setSize}
        />
      </section>
    </>
  );
}
