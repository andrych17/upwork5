'use client';

// Reports: private reports members sent from a live room (schema section 25). Only admins see them; the
// reported person is never told. Resolve when handled (talk to them, turn the account off from Members).
import { useCallback, useState } from 'react';
import { DataTable, Pager, usePaging, type Column } from '@/components/admin/data-table';
import { DateRange, FilterBar, SearchBox, TabFilter } from '@/components/admin/filters';
import { useAdmin } from '@/components/admin/shell';
import { adminRpc, fmtWhen, fromCentralInput, fullName, searchTerm, useLoad } from '@/lib/admin';
import { nextDay } from '@/lib/date-range';

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
  const paging = usePaging();
  const [status, setStatus] = useState<'open' | 'resolved'>('open');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const fetchReports = useCallback(async () => {
    const term = searchTerm(search);
    // The search is on the person reported; !inner drops other people's reports instead of blanking the name.
    let q = supabase
      .from('room_reports')
      .select(
        'id,reason,note,status,created_at,resolved_at,session:sessions(title,starts_at),' +
          'reporter:profiles!room_reports_reporter_id_fkey(first_name,last_name,email),' +
          `reported:profiles!room_reports_reported_id_fkey${term ? '!inner' : ''}(first_name,last_name,email)`,
        { count: 'exact' },
      )
      .eq('status', status)
      .order('created_at', { ascending: false })
      .range(paging.page * paging.size, paging.page * paging.size + paging.size - 1);
    if (from) q = q.gte('created_at', fromCentralInput(`${from}T00:00`) ?? '');
    if (to) q = q.lt('created_at', fromCentralInput(`${nextDay(to)}T00:00`) ?? '');
    if (term) {
      q = q.or(`first_name.ilike.*${term}*,last_name.ilike.*${term}*,email.ilike.*${term}*`, {
        referencedTable: 'reported',
      });
    }
    const { data, error, count } = await q;
    return { rows: (data ?? []) as unknown as Report[], count: count ?? 0, error: Boolean(error) };
  }, [supabase, status, from, to, search, paging.page, paging.size]);

  const { data: result, loading, reload } = useLoad(fetchReports);
  const rows = result?.rows ?? [];
  const filtered = from !== '' || to !== '' || search !== '';
  const reset = () => {
    setFrom('');
    setTo('');
    setSearch('');
    paging.reset();
  };

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

  const columns: Column<Report>[] = [
    {
      header: 'Reported',
      cell: (r) => (
        <>
          <strong>{r.reported ? fullName(r.reported) : 'Someone'}</strong>
          <span className="adm-sub">{r.reported?.email}</span>
        </>
      ),
    },
    {
      header: 'What happened',
      cell: (r) => (
        <>
          {r.reason}
          {r.note && <span className="adm-sub">“{r.note}”</span>}
        </>
      ),
    },
    {
      header: 'Session',
      cell: (r) =>
        r.session ? (
          <>
            {r.session.title}
            <span className="adm-sub">{fmtWhen(r.session.starts_at)}</span>
          </>
        ) : (
          'Session removed'
        ),
    },
    {
      header: 'Reported by',
      cell: (r) => (
        <>
          {r.reporter ? fullName(r.reporter) : 'A member'}
          <span className="adm-sub">{fmtWhen(r.created_at)}</span>
        </>
      ),
    },
    {
      header: '',
      align: 'right',
      cell: (r) =>
        r.status === 'open' ? (
          <button type="button" className="adm-btn adm-btn-sm" disabled={busy} onClick={() => void resolve(r)}>
            Resolve
          </button>
        ) : (
          <span className="adm-badge adm-badge-good">Resolved</span>
        ),
    },
  ];

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Reports</h1>
          <p>Private reports from live rooms. The person reported is never told who reported them.</p>
        </div>
      </header>
      {result?.error && <p className="adm-msg adm-msg-error">Could not load reports. Refresh to try again.</p>}
      {msg && <p className={msg.error ? 'adm-msg adm-msg-error' : 'adm-msg'}>{msg.text}</p>}
      <section className="adm-card">
        <FilterBar onReset={filtered ? reset : undefined}>
          <TabFilter
            label="Status"
            value={status}
            options={[
              { key: 'open', label: 'Open' },
              { key: 'resolved', label: 'Resolved' },
            ]}
            onChange={(s) => {
              setStatus(s);
              paging.reset();
            }}
          />
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
            label="Search the person reported"
            placeholder="Person reported"
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
          empty={
            filtered
              ? 'No reports match these filters.'
              : status === 'open'
                ? 'No open reports.'
                : 'Nothing resolved yet.'
          }
        />
        <Pager
          page={paging.page}
          size={paging.size}
          total={result?.count ?? 0}
          noun={['report', 'reports']}
          loading={loading}
          onPage={paging.setPage}
          onSize={paging.setSize}
        />
      </section>
    </>
  );
}
