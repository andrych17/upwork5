'use client';

// Admin > Feedback: the survey members answer after each session (schema section 39), newest first, the totals,
// a spreadsheet download, and the switch that turns the questions on or off for everyone.
import { useCallback, useEffect, useState } from 'react';
import { DataTable, Pager, usePaging, type Column } from '@/components/admin/data-table';
import { useAdmin } from '@/components/admin/shell';
import { adminRpc, fmtWhen, fullName, useLoad } from '@/lib/admin';
import { AV_LABEL, DEVICE_LABEL, FEEDBACK_COLUMNS, feedbackCsv, type FeedbackRow } from '@/lib/feedback';

interface Summary {
  answers: number;
  members: number;
  members_3plus: number;
  join_avg: number | null;
  roles_avg: number | null;
  comfort_avg: number | null;
  av_yes: number;
  av_mostly: number;
  av_no: number;
}

/** The download takes the newest answers up to this many (a test week of 50 testers is about 200). */
const CSV_LIMIT = 5000;

const avg = (n: number | null) => (n === null ? '–' : `${n} / 5`);

export default function AdminFeedback() {
  const { supabase } = useAdmin();
  const paging = usePaging();
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [downloading, setDownloading] = useState(false);

  const fetchPage = useCallback(async () => {
    const [list, summary] = await Promise.all([
      supabase
        .from('session_feedback')
        .select(FEEDBACK_COLUMNS, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(paging.page * paging.size, paging.page * paging.size + paging.size - 1),
      adminRpc(supabase, 'admin_feedback_summary', {}),
    ]);
    return {
      rows: (list.data ?? []) as unknown as FeedbackRow[],
      count: list.count ?? 0,
      summary: summary.ok ? (summary.data as unknown as Summary) : null,
      error: Boolean(list.error) || !summary.ok,
    };
  }, [supabase, paging.page, paging.size]);

  const { data: result, loading } = useLoad(fetchPage);
  const rows = result?.rows ?? [];
  const s = result?.summary;

  const download = async () => {
    setDownloading(true);
    setMsg(null);
    const { data, error } = await supabase
      .from('session_feedback')
      .select(FEEDBACK_COLUMNS)
      .order('created_at', { ascending: false })
      .range(0, CSV_LIMIT - 1);
    setDownloading(false);
    if (error) {
      setMsg({ text: 'The spreadsheet could not be made. Please try again.', error: true });
      return;
    }
    const blob = new Blob([feedbackCsv((data ?? []) as unknown as FeedbackRow[], fmtWhen)], {
      type: 'text/csv;charset=utf-8',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `meetdoconnect-feedback-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const columns: Column<FeedbackRow>[] = [
    {
      header: 'Member',
      cell: (r) => (
        <>
          <strong>{r.profiles ? fullName(r.profiles) : 'Deleted member'}</strong>
          {r.profiles?.email && <span className="adm-sub">{r.profiles.email}</span>}
          <span className="adm-sub">{DEVICE_LABEL[r.device]}</span>
        </>
      ),
    },
    {
      header: 'Session',
      cell: (r) => (
        <>
          {r.sessions?.title ?? 'Deleted session'}
          {r.sessions && <span className="adm-sub">{fmtWhen(r.sessions.starts_at)}</span>}
          <span className="adm-sub">Sent {fmtWhen(r.updated_at)}</span>
        </>
      ),
    },
    {
      header: 'Answers',
      cell: (r) => (
        <dl className="fb-answers">
          <dt>Joining</dt>
          <dd>{r.join_ease} / 5</dd>
          <dt>Video and audio</dt>
          <dd>{AV_LABEL[r.av]}</dd>
          <dt>Roles and prompts</dt>
          <dd>{r.roles} / 5</dd>
          <dt>Comfort</dt>
          <dd>{r.comfort} / 5</dd>
        </dl>
      ),
    },
    {
      header: 'Comments',
      cell: (r) =>
        r.av_note || r.comfort_note || r.confusing ? (
          <div className="fb-comments">
            {r.av_note && (
              <p>
                <span>Video and audio:</span> {r.av_note}
              </p>
            )}
            {r.comfort_note && (
              <p>
                <span>Less comfortable:</span> {r.comfort_note}
              </p>
            )}
            {r.confusing && (
              <p>
                <span>Confusing:</span> {r.confusing}
              </p>
            )}
          </div>
        ) : (
          <span className="adm-sub">No comments</span>
        ),
    },
  ];

  const total = s?.answers ?? 0;
  const tiles = [
    { label: 'Answers', value: s ? String(s.answers) : '–', sub: s ? `from ${s.members} members` : '' },
    { label: 'Members with 3 or more', value: s ? String(s.members_3plus) : '–', sub: 'for the second free week' },
    { label: 'How easy to join', value: s ? avg(s.join_avg) : '–', sub: 'average' },
    {
      label: 'Video and audio worked',
      value: s && total ? `${Math.round((s.av_yes / total) * 100)}%` : '–',
      sub: s ? `${s.av_mostly} mostly, ${s.av_no} no` : '',
    },
    { label: 'Roles and prompts', value: s ? avg(s.roles_avg) : '–', sub: 'average' },
    { label: 'Comfort in the room', value: s ? avg(s.comfort_avg) : '–', sub: 'average' },
  ];

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Feedback</h1>
          <p>
            The four questions and the comment box members answer when they leave a session, with their name and the
            session attached.
          </p>
        </div>
        <button
          type="button"
          className="adm-btn adm-btn-primary"
          disabled={downloading || total === 0}
          onClick={() => void download()}
        >
          {downloading ? 'Making the file…' : 'Download spreadsheet'}
        </button>
      </header>
      {result?.error && (
        <p className="adm-msg adm-msg-error">
          Could not load the feedback. If this is new, run the feedback SQL first, then refresh.
        </p>
      )}
      {msg && <p className={msg.error ? 'adm-msg adm-msg-error' : 'adm-msg'}>{msg.text}</p>}

      <FeedbackSwitch />

      <div className="adm-stats">
        {tiles.map((t) => (
          <div key={t.label} className="adm-stat">
            <span>{t.label}</span>
            <strong>{t.value}</strong>
            {t.sub && <span>{t.sub}</span>}
          </div>
        ))}
      </div>

      <section className="adm-card fb-list">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={loading}
          empty="No feedback yet. Answers show up here once members leave a session."
        />
        <Pager
          page={paging.page}
          size={paging.size}
          total={result?.count ?? 0}
          noun={['answer', 'answers']}
          loading={loading}
          onPage={paging.setPage}
          onSize={paging.setSize}
        />
      </section>
    </>
  );
}

function FeedbackSwitch() {
  const { supabase } = useAdmin();
  const [on, setOn] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    void supabase
      .from('app_config')
      .select('feedback_on')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!live) return;
        if (error || !data) setMsg({ text: 'Could not load the switch. Run the feedback SQL first.', error: true });
        else setOn((data as { feedback_on: boolean }).feedback_on);
      });
    return () => {
      live = false;
    };
  }, [supabase]);

  if (on === null) return msg ? <p className="adm-msg adm-msg-error">{msg.text}</p> : null;

  const change = async (next: boolean) => {
    setSaving(true);
    const res = await adminRpc(supabase, 'admin_feedback_setting', { p_on: next });
    setSaving(false);
    if (res.ok) setOn(next);
    setMsg({ text: res.ok ? 'Saved.' : res.error, error: !res.ok });
  };

  return (
    <section className="adm-card fb-switch">
      <div className="adm-card-head">
        <h2>Questions after each session</h2>
        <span className={on ? 'adm-badge adm-badge-good' : 'adm-badge'}>{on ? 'On' : 'Off'}</span>
      </div>
      <div className="adm-card-body adm-form">
        <label className="adm-check">
          <input type="checkbox" checked={on} disabled={saving} onChange={(e) => void change(e.target.checked)} />
          Ask members the four questions when they leave a session (they can skip)
        </label>
        {msg && (
          <span className={msg.error ? 'adm-msg adm-msg-error' : 'adm-msg'} role="status">
            {msg.text}
          </span>
        )}
      </div>
    </section>
  );
}
