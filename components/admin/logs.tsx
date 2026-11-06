'use client';

// Activity log, read only: admin actions, credits given, member emails, session reminders, and app errors
// (browser-side problems with video, camera and uploads, schema section 33).
import { useCallback, useState } from 'react';
import { useAdmin } from '@/components/admin/shell';
import { PAGE_SIZE, fmtWhen, fullName, useLoad } from '@/lib/admin';

type Tab = 'admin' | 'credits' | 'notices' | 'reminders' | 'errors';

type Who = { first_name: string | null; last_name: string | null; email: string | null } | null;

interface Row {
  key: string;
  when: string;
  what: string;
  who: string;
  detail: string;
  failed?: boolean;
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'admin', label: 'Admin actions' },
  { key: 'credits', label: 'Credits given' },
  { key: 'notices', label: 'Member emails' },
  { key: 'reminders', label: 'Reminders' },
  { key: 'errors', label: 'App errors' },
];

/** The device part of a user agent, e.g. "iPhone; CPU iPhone OS 18_1 like Mac OS X". */
const device = (ua: string | null) => ua?.match(/\(([^)]+)\)/)?.[1] ?? ua ?? '';

const name = (w: Who) => (w ? fullName(w) : '');
const sentence = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

function describe(details: Record<string, unknown>): string {
  return Object.entries(details)
    .filter(([, v]) => v !== null && v !== '')
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
}

export default function AdminLogs() {
  const { supabase } = useAdmin();
  const [tab, setTab] = useState<Tab>('admin');
  const [page, setPage] = useState(0);
  const fetchLog = useCallback(async (): Promise<{ rows: Row[]; hasMore: boolean; error: boolean }> => {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE; // one extra row tells us there is a next page
    let result: { rows: Row[]; error: unknown };

    if (tab === 'admin') {
      const { data, error: e } = await supabase
        .from('admin_log')
        .select(
          'id,action,details,created_at,admin:profiles!admin_log_admin_id_fkey(first_name,last_name,email),' +
            'member:profiles!admin_log_profile_id_fkey(first_name,last_name,email),session:sessions(title)',
        )
        .order('created_at', { ascending: false })
        .range(from, to);
      const list = (data ?? []) as unknown as {
        id: string;
        action: string;
        details: Record<string, unknown>;
        created_at: string;
        admin: Who;
        member: Who;
        session: { title: string } | null;
      }[];
      result = {
        error: e,
        rows: list.map((r) => ({
          key: r.id,
          when: r.created_at,
          what: sentence(r.action),
          who: [r.member ? name(r.member) : r.session?.title, r.admin ? `by ${name(r.admin)}` : '']
            .filter(Boolean)
            .join(' '),
          detail: describe(r.details ?? {}),
        })),
      };
    } else if (tab === 'credits') {
      const { data, error: e } = await supabase
        .from('credit_grants')
        .select(
          'id,amount,reason,created_at,member:profiles!credit_grants_profile_id_fkey(first_name,last_name,email),' +
            'by:profiles!credit_grants_granted_by_fkey(first_name,last_name,email)',
        )
        .order('created_at', { ascending: false })
        .range(from, to);
      const list = (data ?? []) as unknown as {
        id: string;
        amount: number;
        reason: string;
        created_at: string;
        member: Who;
        by: Who;
      }[];
      result = {
        error: e,
        rows: list.map((r) => ({
          key: r.id,
          when: r.created_at,
          what: `${r.amount} extra ${r.amount === 1 ? 'credit' : 'credits'}`,
          who: [name(r.member), r.by ? `by ${name(r.by)}` : ''].filter(Boolean).join(' '),
          detail: r.reason,
        })),
      };
    } else if (tab === 'notices') {
      const { data, error: e } = await supabase
        .from('member_notices')
        .select('id,kind,note,created_at,email_sent,error,member:profiles(first_name,last_name,email)')
        .order('created_at', { ascending: false })
        .range(from, to);
      const list = (data ?? []) as unknown as {
        id: string;
        kind: string;
        note: string | null;
        created_at: string;
        email_sent: boolean | null;
        error: string | null;
        member: Who;
      }[];
      result = {
        error: e,
        rows: list.map((r) => ({
          key: r.id,
          when: r.created_at,
          what: sentence(r.kind),
          who: name(r.member),
          detail: [
            r.email_sent === null ? 'waiting to send' : r.email_sent ? 'email sent' : 'email failed',
            r.note,
            r.error,
          ]
            .filter(Boolean)
            .join(' · '),
          failed: r.email_sent === false,
        })),
      };
    } else if (tab === 'errors') {
      const { data, error: e } = await supabase
        .from('client_errors')
        .select(
          'id,kind,message,page,user_agent,details,created_at,member:profiles(first_name,last_name,email),session:sessions(title)',
        )
        .order('created_at', { ascending: false })
        .range(from, to);
      const list = (data ?? []) as unknown as {
        id: string;
        kind: string;
        message: string;
        page: string | null;
        user_agent: string | null;
        details: Record<string, unknown>;
        created_at: string;
        member: Who;
        session: { title: string } | null;
      }[];
      result = {
        error: e,
        rows: list.map((r) => ({
          key: r.id,
          when: r.created_at,
          what: `${sentence(r.kind)}${r.session ? `, ${r.session.title}` : ''}`,
          who: name(r.member),
          detail: [r.message, r.page, device(r.user_agent), describe(r.details ?? {})].filter(Boolean).join(' · '),
          failed: true,
        })),
      };
    } else {
      const { data, error: e } = await supabase
        .from('reminder_log')
        .select(
          'booking_id,kind,claimed_at,push_sent,email_sent,sms_sent,error,' +
            'booking:bookings(member:profiles!bookings_user_id_fkey(first_name,last_name,email),session:sessions(title))',
        )
        .order('claimed_at', { ascending: false })
        .range(from, to);
      const list = (data ?? []) as unknown as {
        booking_id: string;
        kind: string;
        claimed_at: string;
        push_sent: number | null;
        email_sent: boolean | null;
        sms_sent: boolean | null;
        error: string | null;
        booking: { member: Who; session: { title: string } | null } | null;
      }[];
      result = {
        error: e,
        rows: list.map((r) => ({
          key: `${r.booking_id}-${r.kind}`,
          when: r.claimed_at,
          what: `${r.kind} reminder${r.booking?.session ? `, ${r.booking.session.title}` : ''}`,
          who: name(r.booking?.member ?? null),
          detail: [
            `push ${r.push_sent ?? 0}`,
            `email ${r.email_sent ? 'sent' : 'no'}`,
            `sms ${r.sms_sent ? 'sent' : 'no'}`,
            r.error,
          ]
            .filter(Boolean)
            .join(' · '),
          failed: Boolean(r.error),
        })),
      };
    }

    return {
      rows: result.rows.slice(0, PAGE_SIZE),
      hasMore: result.rows.length > PAGE_SIZE,
      error: Boolean(result.error),
    };
  }, [supabase, tab, page]);

  const { data: log, loading } = useLoad(fetchLog);
  const rows = log?.rows ?? [];
  const hasMore = log?.hasMore ?? false;
  const error = log?.error ? 'Could not load the log. Refresh to try again.' : '';

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Activity log</h1>
          <p>Read only. Newest first, times in Central.</p>
        </div>
      </header>
      <section className="adm-card">
        <div className="adm-card-head">
          <div className="adm-tabs" role="group" aria-label="Log">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                aria-pressed={tab === t.key}
                onClick={() => {
                  setTab(t.key);
                  setPage(0);
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <p className="adm-msg adm-msg-error" style={{ margin: '1rem' }}>
            {error}
          </p>
        )}
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>When</th>
                <th>What</th>
                <th>Who</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtWhen(r.when)}</td>
                  <td>{r.failed ? <span className="adm-badge adm-badge-bad">{r.what}</span> : r.what}</td>
                  <td>{r.who}</td>
                  <td className="adm-sub" style={{ display: 'table-cell' }}>
                    {r.detail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && rows.length === 0 && <p className="adm-empty">Nothing logged yet.</p>}
        </div>
        <div className="adm-pager">
          <span>{loading ? 'Loading…' : `Page ${page + 1}`}</span>
          <div className="adm-toolbar">
            <button
              type="button"
              className="adm-btn adm-btn-sm"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              Newer
            </button>
            <button type="button" className="adm-btn adm-btn-sm" disabled={!hasMore} onClick={() => setPage(page + 1)}>
              Older
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
