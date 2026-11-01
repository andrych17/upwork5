'use client';

// Hello Videos waiting for review, oldest first. Watching links last 15 minutes (hello-video Edge Function);
// Approve or Not approved deletes the file right away.
import { useCallback, useEffect, useState } from 'react';
import { callEdge, type EdgeResult } from '@/lib/edge';
import { getSupabase } from '@/lib/supabase';

interface QueueItem {
  id: string;
  user_id: string;
  name: string;
  email: string;
  tier: 'individual' | 'household';
  household_member: boolean;
  duration_seconds: number;
  created_at: string;
  url: string | null;
}

interface Declined {
  id: string;
  name: string;
  email: string;
  plan: string;
  declined_at: string | null;
  refunded_at: string | null;
}

const SAMPLE: QueueItem[] = [
  {
    id: 'demo-1',
    user_id: 'm-1',
    name: 'Maya Lin',
    email: 'maya.lin@example.com',
    tier: 'individual',
    household_member: false,
    duration_seconds: 48,
    created_at: '2026-10-30T14:12:00Z',
    url: null,
  },
  {
    id: 'demo-2',
    user_id: 'm-2',
    name: 'Jordan C.',
    email: 'jordan@example.com',
    tier: 'household',
    household_member: true,
    duration_seconds: 95,
    created_at: '2026-10-30T16:40:00Z',
    url: null,
  },
];

const SAMPLE_DECLINED: Declined[] = [
  {
    id: 'demo-d1',
    name: 'Alex R.',
    email: 'alex@example.com',
    plan: 'individual monthly',
    declined_at: '2026-10-29T18:05:00Z',
    refunded_at: null,
  },
];

// People who were declined, so nobody who needs a refund is forgotten. The refund itself is made in the
// payment processor; Mark refunded only remembers it.
async function fetchDeclined(): Promise<Declined[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.rpc('hello_declined_list');
  const res = data as { success: boolean; items?: Declined[] } | null;
  return res?.success && res.items ? res.items : null;
}

const fetchQueue = () => callEdge<{ items: QueueItem[] }>('hello-video', { action: 'queue' });

const button = {
  padding: '8px 14px',
  borderRadius: '6px',
  border: 'none',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
} as const;

export default function HelloVideoQueue({ onCount }: { onCount?: (count: number) => void }) {
  const live = Boolean(getSupabase());
  const [items, setItems] = useState<QueueItem[]>(() => (live ? [] : SAMPLE));
  const [loading, setLoading] = useState(live);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [declined, setDeclined] = useState<Declined[]>(() => (live ? [] : SAMPLE_DECLINED));

  const reloadDeclined = () => fetchDeclined().then((list) => list && setDeclined(list));
  const markRefunded = async (person: Declined, done: boolean) => {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase.rpc('hello_mark_refunded', { p_user: person.id, p_done: done });
      const res = data as { success: boolean; error?: string } | null;
      if (error || !res?.success) {
        setMessage({ tone: 'error', text: error?.message || res?.error || 'Could not save. Please try again.' });
        return;
      }
    }
    setDeclined((current) =>
      current.map((x) => (x.id === person.id ? { ...x, refunded_at: done ? new Date().toISOString() : null } : x)),
    );
  };

  const show = useCallback((res: EdgeResult<{ items: QueueItem[] }>) => {
    setLoading(false);
    if (res.error !== null) setMessage({ tone: 'error', text: res.error });
    else setItems(res.data.items);
  }, []);
  const refresh = async () => show(await fetchQueue());

  useEffect(() => {
    if (!live) return;
    let current = true;
    fetchQueue().then((res) => current && show(res));
    fetchDeclined().then((list) => current && list && setDeclined(list));
    return () => {
      current = false;
    };
  }, [live, show]);

  useEffect(() => {
    onCount?.(items.length);
  }, [items.length, onCount]);

  // approve: let them in. Not approved: ask for a new video, held bookings stay. Decline: held bookings are released.
  const review = async (item: QueueItem, approve: boolean, release = false) => {
    setMessage(null);
    if (
      release &&
      !window.confirm(
        `Decline ${item.name || 'this member'}? Their held bookings are released, the credits go back, and they can’t record again. Refund the payment in your payment processor.`,
      )
    )
      return;
    const who = item.name || 'This member';
    const done = approve
      ? `${who} is approved. Held bookings are now confirmed. The video was deleted.`
      : release
        ? `${who} was declined and held bookings were released. Refund their payment in your payment processor. The video was deleted.`
        : `${who} was asked to record again. The video was deleted.`;
    if (!live) {
      setItems((current) => current.filter((x) => x.id !== item.id));
      setMessage({ tone: 'ok', text: done });
      return;
    }
    setBusy(item.id);
    const res = await callEdge<{ status: string }>('hello-video', {
      action: 'review',
      id: item.id,
      approve,
      release,
      reason: approve ? null : (reasons[item.id] ?? '').trim() || null,
    });
    setBusy(null);
    if (res.error !== null) {
      setMessage({ tone: 'error', text: res.error });
      return;
    }
    setItems((current) => current.filter((x) => x.id !== item.id));
    setMessage({ tone: 'ok', text: done });
    if (release) reloadDeclined();
  };

  return (
    <div style={{ padding: '20px', display: 'grid', gap: '16px' }}>
      <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
        Only admins can see these. A video is deleted as soon as you choose Approve, Not approved or Decline.
        {!live && ' (Preview: sample members. Videos play here once uploads are connected.)'}
        {live && ' Links expire after 15 minutes; '}
        {live && (
          <button
            type="button"
            onClick={refresh}
            style={{ ...button, padding: 0, background: 'none', color: '#b45309' }}
          >
            refresh
          </button>
        )}
      </p>
      {message && (
        <p role="status" style={{ margin: 0, fontSize: '13px', color: message.tone === 'ok' ? '#065f46' : '#991b1b' }}>
          {message.text}
        </p>
      )}
      {loading && <p style={{ margin: 0, fontSize: '14px' }}>Loading…</p>}
      {!loading && items.length === 0 && <p style={{ margin: 0, fontSize: '14px' }}>Nothing to review right now.</p>}
      {items.map((item) => (
        <article
          key={item.id}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '18px',
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            padding: '14px',
          }}
        >
          <div style={{ flex: '0 1 360px', minWidth: 0 }}>
            {item.url ? (
              <video
                src={item.url}
                controls
                preload="metadata"
                playsInline
                style={{ width: '100%', borderRadius: '8px', background: '#111' }}
              />
            ) : (
              <div
                style={{
                  aspectRatio: '16 / 9',
                  borderRadius: '8px',
                  background: '#f3f4f6',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '13px',
                  color: '#6b7280',
                }}
              >
                Video preview
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gap: '10px', alignContent: 'start', flex: '1 1 260px' }}>
            <div>
              <div style={{ fontWeight: 600, color: '#111827' }}>{item.name || 'Member'}</div>
              <div style={{ fontSize: '13px', color: '#6b7280' }}>
                {item.email} ·{' '}
                {item.tier === 'household' ? (item.household_member ? 'Household member' : 'Household') : 'Solo'} ·{' '}
                {item.duration_seconds} s · sent {new Date(item.created_at).toLocaleString()}
              </div>
            </div>
            <input
              type="text"
              maxLength={300}
              placeholder="Note if not approved (optional, the member sees it)"
              value={reasons[item.id] ?? ''}
              onChange={(e) => setReasons((current) => ({ ...current, [item.id]: e.target.value }))}
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px' }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                disabled={busy === item.id}
                onClick={() => review(item, true)}
                style={{ ...button, background: '#059669', color: 'white' }}
              >
                Approve
              </button>
              <button
                type="button"
                disabled={busy === item.id}
                onClick={() => review(item, false)}
                style={{ ...button, background: '#f3f4f6', color: '#991b1b' }}
              >
                Not approved
              </button>
              <button
                type="button"
                disabled={busy === item.id}
                onClick={() => review(item, false, true)}
                style={{ ...button, background: '#991b1b', color: 'white' }}
              >
                Decline and release bookings
              </button>
            </div>
          </div>
        </article>
      ))}

      {declined.length > 0 && (
        <section style={{ display: 'grid', gap: '8px', marginTop: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '15px' }}>
            Declined: refund needed ({declined.filter((x) => !x.refunded_at).length})
          </h3>
          <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
            Refund these payments in your payment processor, then tick Mark refunded so nobody is forgotten.
          </p>
          {declined.map((person) => (
            <div
              key={person.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '10px 14px',
                background: person.refunded_at ? '#f9fafb' : 'white',
              }}
            >
              <div style={{ fontSize: '14px' }}>
                <strong>{person.name || 'Member'}</strong> · {person.email}
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  {person.plan}
                  {person.declined_at && ` · declined ${new Date(person.declined_at).toLocaleDateString()}`}
                  {person.refunded_at && ` · refunded ${new Date(person.refunded_at).toLocaleDateString()}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => markRefunded(person, !person.refunded_at)}
                style={{
                  ...button,
                  background: person.refunded_at ? '#f3f4f6' : '#059669',
                  color: person.refunded_at ? '#4b5563' : 'white',
                }}
              >
                {person.refunded_at ? 'Undo' : 'Mark refunded'}
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
