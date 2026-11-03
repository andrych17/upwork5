'use client';

import { useCallback, useState } from 'react';
import { DataTable, Pager, usePaging, type Column } from '@/components/admin/data-table';
import { DateRange, FilterBar, SearchBox, SelectFilter, TabFilter } from '@/components/admin/filters';
import MemberDetail from '@/components/admin/member-detail';
import { useAdmin } from '@/components/admin/shell';
import {
  PROFILE_COLUMNS,
  STATUS_LABEL,
  fmtDate,
  fromCentralInput,
  fullName,
  searchTerm,
  statusBadge,
  useLoad,
  type AdminProfile,
} from '@/lib/admin';
import { nextDay } from '@/lib/date-range';

type Plan = 'all' | 'individual' | 'household';

const PLANS: { key: Plan; label: string }[] = [
  { key: 'all', label: 'Any plan' },
  { key: 'individual', label: 'Solo' },
  { key: 'household', label: 'Household' },
];

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
  const paging = usePaging();
  const [filter, setFilter] = useState<Filter>('all');
  const [plan, setPlan] = useState<Plan>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    let q = supabase
      .from('profiles')
      .select(PROFILE_COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(paging.page * paging.size, paging.page * paging.size + paging.size - 1);
    if (plan !== 'all') q = q.eq('tier', plan);
    if (from) q = q.gte('created_at', fromCentralInput(`${from}T00:00`) ?? '');
    if (to) q = q.lt('created_at', fromCentralInput(`${nextDay(to)}T00:00`) ?? '');
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
  }, [supabase, filter, plan, from, to, search, paging.page, paging.size]);

  const { data: result, loading, reload } = useLoad(fetchMembers);
  const rows = result?.rows ?? [];
  const total = result?.total ?? 0;
  const error = result?.error ?? '';

  const filtered = filter !== 'all' || plan !== 'all' || from !== '' || to !== '' || search !== '';
  const change =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      paging.reset();
    };
  const reset = () => {
    setFilter('all');
    setPlan('all');
    setFrom('');
    setTo('');
    setSearch('');
    paging.reset();
  };

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
          <FilterBar onReset={filtered ? reset : undefined}>
            <TabFilter label="Status" value={filter} options={FILTERS} onChange={change(setFilter)} />
            <SelectFilter label="Plan" value={plan} options={PLANS} onChange={change(setPlan)} />
            <DateRange
              from={from}
              to={to}
              onChange={(f, t) => {
                setFrom(f);
                setTo(t);
                paging.reset();
              }}
            />
            <SearchBox label="Search members" placeholder="Name or email" value={search} onSearch={change(setSearch)} />
          </FilterBar>
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
            empty={filtered ? 'No members match these filters.' : 'No members yet.'}
            selectedKey={selected}
            onRowClick={(m) => setSelected(m.id)}
          />
          <Pager
            page={paging.page}
            size={paging.size}
            total={total}
            noun={['member', 'members']}
            loading={loading}
            onPage={paging.setPage}
            onSize={paging.setSize}
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
