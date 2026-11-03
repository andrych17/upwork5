'use client';

import { useCallback, useState } from 'react';
import { DataTable, Pager, type Column } from '@/components/admin/data-table';
import MemberDetail from '@/components/admin/member-detail';
import { useAdmin } from '@/components/admin/shell';
import {
  PAGE_SIZE,
  PROFILE_COLUMNS,
  STATUS_LABEL,
  fmtDate,
  fullName,
  searchTerm,
  statusBadge,
  useLoad,
  type AdminProfile,
} from '@/lib/admin';

type Filter = 'all' | 'pending' | 'active' | 'past_due' | 'paused' | 'canceled' | 'off' | 'admins';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'pending', label: 'Not paid yet' },
  { key: 'past_due', label: 'Past due' },
  { key: 'paused', label: 'Paused' },
  { key: 'canceled', label: 'Canceled' },
  { key: 'off', label: 'Turned off' },
  { key: 'admins', label: 'Admins' },
];

const COLUMNS: Column<AdminProfile>[] = [
  {
    header: 'Member',
    cell: (m) => (
      <>
        <strong>{fullName(m)}</strong>
        {m.is_admin && (
          <span className="adm-badge adm-badge-accent" style={{ marginLeft: 6 }}>
            Admin
          </span>
        )}
        <span className="adm-sub">{m.email}</span>
      </>
    ),
  },
  {
    header: 'Plan',
    cell: (m) => (
      <>
        {m.household_owner_id ? 'Household member' : m.tier === 'household' ? 'Household' : 'Solo'}
        <span className="adm-sub">{m.household_owner_id ? 'Shares the holder’s plan' : m.billing_interval}</span>
      </>
    ),
  },
  {
    header: 'Credits',
    cell: (m) => (
      <>
        {m.monthly_credits} monthly
        <span className="adm-sub">{m.addon_credits} extra</span>
      </>
    ),
  },
  {
    header: 'Status',
    cell: (m) =>
      m.disabled_at ? (
        <span className="adm-badge adm-badge-bad">Turned off</span>
      ) : (
        <span className={statusBadge(m.payment_status)}>{STATUS_LABEL[m.payment_status]}</span>
      ),
  },
  { header: 'Joined', cell: (m) => fmtDate(m.created_at) },
];

export default function AdminMembers() {
  const { supabase } = useAdmin();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    let q = supabase
      .from('profiles')
      .select(PROFILE_COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (filter === 'off') q = q.not('disabled_at', 'is', null);
    else if (filter === 'admins') q = q.eq('is_admin', true);
    else if (filter !== 'all') q = q.eq('payment_status', filter);
    const term = searchTerm(search);
    if (term) q = q.or(`first_name.ilike.*${term}*,last_name.ilike.*${term}*,email.ilike.*${term}*`);
    const { data, count, error } = await q;
    return {
      rows: (data ?? []) as unknown as AdminProfile[],
      total: count ?? 0,
      error: error ? 'Could not load members. Refresh to try again.' : '',
    };
  }, [supabase, filter, search, page]);

  const { data: result, loading, reload } = useLoad(fetchMembers);
  const rows = result?.rows ?? [];
  const total = result?.total ?? 0;
  const error = result?.error ?? '';

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Members</h1>
          <p>Plans, payment status, credits, admin access and bookings.</p>
        </div>
      </header>
      <div className={selected ? 'adm-split' : undefined}>
        <section className="adm-card">
          <div className="adm-card-head">
            <div className="adm-tabs" role="group" aria-label="Filter members">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={filter === f.key}
                  onClick={() => {
                    setFilter(f.key);
                    setPage(0);
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <form
              className="adm-toolbar"
              onSubmit={(e) => {
                e.preventDefault();
                setPage(0);
                setSearch(query);
              }}
            >
              <input
                className="adm-input"
                type="search"
                placeholder="Name or email"
                aria-label="Search members"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="submit" className="adm-btn">
                Search
              </button>
            </form>
          </div>
          {error && (
            <p className="adm-msg adm-msg-error" style={{ margin: '1rem' }}>
              {error}
            </p>
          )}
          <DataTable
            columns={COLUMNS}
            rows={rows}
            rowKey={(m) => m.id}
            loading={loading}
            empty="No members match."
            selectedKey={selected}
            onRowClick={(m) => setSelected(m.id)}
          />
          <Pager
            page={page}
            pages={pages}
            total={total}
            noun={['member', 'members']}
            loading={loading}
            onPage={setPage}
          />
        </section>
        {selected && (
          <MemberDetail
            key={selected}
            id={selected}
            onClose={() => setSelected(null)}
            onChanged={reload}
            onOpen={setSelected}
          />
        )}
      </div>
    </>
  );
}
