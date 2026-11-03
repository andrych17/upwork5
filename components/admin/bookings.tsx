'use client';

// Bookings: one row per seat, with filters (when, dates, status, credit, member) and paging done in the database
// (admin_list_bookings, schema section 30). Cancel returns the credit for a seat in a room that has not started.
import { useCallback, useState } from 'react';
import { DataTable, Pager, usePaging, type Column } from '@/components/admin/data-table';
import { DateRange, FilterBar, SearchBox, SelectFilter, TabFilter } from '@/components/admin/filters';
import { useAdmin } from '@/components/admin/shell';
import { adminRpc, fmtWhen, fromCentralInput, fullName, useLoad } from '@/lib/admin';
import { nextDay } from '@/lib/date-range';

interface Seat {
  id: string;
  status: 'confirmed' | 'cancelled' | 'late_cancelled' | 'attended';
  credit_type: 'monthly' | 'addon';
  held: boolean;
  camera_off: boolean;
  created_at: string;
  release_reason: string | null;
  session: { id: string; title: string; starts_at: string };
  member: { first_name: string | null; last_name: string | null; email: string | null };
}

type When = 'upcoming' | 'past' | 'all';
type Status = 'all' | 'confirmed' | 'held' | 'cancelled' | 'late_cancelled' | 'attended';
type Credit = 'all' | 'monthly' | 'addon';

const WHEN: { key: When; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'all', label: 'All' },
];

const STATUSES: { key: Status; label: string }[] = [
  { key: 'all', label: 'Any status' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'held', label: 'Held for Hello Video' },
  { key: 'cancelled', label: 'Cancelled, credit returned' },
  { key: 'late_cancelled', label: 'Cancelled late, credit kept' },
  { key: 'attended', label: 'Attended' },
];

const CREDITS: { key: Credit; label: string }[] = [
  { key: 'all', label: 'Any credit' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'addon', label: 'Extra' },
];

const STATUS_BADGE: Record<Seat['status'], { cls: string; label: string }> = {
  confirmed: { cls: 'adm-badge adm-badge-good', label: 'Confirmed' },
  attended: { cls: 'adm-badge adm-badge-good', label: 'Attended' },
  cancelled: { cls: 'adm-badge', label: 'Cancelled' },
  late_cancelled: { cls: 'adm-badge adm-badge-warn', label: 'Late cancel' },
};

const later = (a: string | null, b: string | null) => (a && b ? (a > b ? a : b) : (a ?? b));
const earlier = (a: string | null, b: string | null) => (a && b ? (a < b ? a : b) : (a ?? b));

export default function AdminBookings() {
  const { supabase } = useAdmin();
  const paging = usePaging();
  const [when, setWhen] = useState<When>('upcoming');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [credit, setCredit] = useState<Credit>('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const fetchSeats = useCallback(async () => {
    // "Upcoming" and "Past" split at this moment; the day pickers narrow it further (Central-time days).
    const nowIso = new Date().toISOString();
    const lower = later(when === 'upcoming' ? nowIso : null, from ? fromCentralInput(`${from}T00:00`) : null);
    const upper = earlier(when === 'past' ? nowIso : null, to ? fromCentralInput(`${nextDay(to)}T00:00`) : null);
    const res = await adminRpc(supabase, 'admin_list_bookings', {
      p_search: search || null,
      p_status: status === 'all' ? null : status,
      p_credit: credit === 'all' ? null : credit,
      p_from: lower,
      p_to: upper,
      p_newest_first: when === 'past',
      p_offset: paging.page * paging.size,
      p_limit: paging.size,
    });
    return {
      rows: res.ok ? (res.data.rows as Seat[]) : [],
      total: res.ok ? Number(res.data.total) : 0,
      error: !res.ok,
    };
  }, [supabase, when, from, to, status, credit, search, paging.page, paging.size]);

  const { data: result, loading, reload } = useLoad(fetchSeats);
  const rows = result?.rows ?? [];

  const filtered =
    when !== 'upcoming' || from !== '' || to !== '' || status !== 'all' || credit !== 'all' || search !== '';
  const change =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      paging.reset();
    };
  const reset = () => {
    setWhen('upcoming');
    setFrom('');
    setTo('');
    setStatus('all');
    setCredit('all');
    setSearch('');
    paging.reset();
  };

  const cancel = async (seat: Seat) => {
    const who = fullName(seat.member);
    const reason = window.prompt(`Cancel ${who}'s seat? The credit goes back. Reason:`);
    if (!reason?.trim()) return;
    setBusy(true);
    const res = await adminRpc(supabase, 'admin_cancel_booking', {
      p_booking: seat.id,
      p_refund: true,
      p_reason: reason,
    });
    setBusy(false);
    setMsg({ text: res.ok ? `Cancelled ${who}'s seat and returned the credit.` : res.error, error: !res.ok });
    if (res.ok) reload();
  };

  const columns: Column<Seat>[] = [
    {
      header: 'Session',
      cell: (s) => (
        <>
          <strong>{s.session.title}</strong>
          <span className="adm-sub">{fmtWhen(s.session.starts_at)}</span>
        </>
      ),
    },
    {
      header: 'Member',
      cell: (s) => (
        <>
          {fullName(s.member)}
          <span className="adm-sub">{s.member.email}</span>
        </>
      ),
    },
    { header: 'Credit', width: '6.5rem', cell: (s) => (s.credit_type === 'addon' ? 'Extra' : 'Monthly') },
    {
      header: 'Status',
      width: '13rem',
      cell: (s) => {
        const b = STATUS_BADGE[s.status];
        const notes = [
          s.held && s.status === 'confirmed' && 'Held for Hello Video',
          s.camera_off && 'Bad Hair Day',
          s.release_reason,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <>
            <span className={b.cls}>{b.label}</span>
            {notes && <span className="adm-sub">{notes}</span>}
          </>
        );
      },
    },
    { header: 'Booked', width: '10rem', cell: (s) => fmtWhen(s.created_at) },
    {
      header: '',
      align: 'right',
      width: '6.5rem',
      cell: (s) =>
        s.status === 'confirmed' && new Date(s.session.starts_at) > new Date() ? (
          <button
            type="button"
            className="adm-btn adm-btn-sm adm-btn-danger"
            disabled={busy}
            onClick={() => void cancel(s)}
          >
            Cancel
          </button>
        ) : null,
    },
  ];

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Bookings</h1>
          <p>Every seat in every room. Filter by when, status, credit or member.</p>
        </div>
      </header>
      {result?.error && <p className="adm-msg adm-msg-error">Could not load bookings. Refresh to try again.</p>}
      {msg && <p className={msg.error ? 'adm-msg adm-msg-error' : 'adm-msg'}>{msg.text}</p>}
      <section className="adm-card">
        <FilterBar onReset={filtered ? reset : undefined}>
          <TabFilter label="When" value={when} options={WHEN} onChange={change(setWhen)} />
          <SelectFilter label="Status" value={status} options={STATUSES} onChange={change(setStatus)} />
          <SelectFilter label="Credit" value={credit} options={CREDITS} onChange={change(setCredit)} />
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
          rowKey={(s) => s.id}
          loading={loading}
          empty={filtered ? 'No seats match these filters.' : 'No upcoming seats yet.'}
        />
        <Pager
          page={paging.page}
          size={paging.size}
          total={result?.total ?? 0}
          noun={['seat', 'seats']}
          loading={loading}
          onPage={paging.setPage}
          onSize={paging.setSize}
        />
      </section>
    </>
  );
}
