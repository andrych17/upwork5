'use client';

// My sessions: the signed-in member's upcoming seats (get_schedule p_mine) and their
// balances (get_my_membership). Bad Hair Day goes through set_booking_camera(), cancelling through
// cancel_booking(), which returns the credit when it is more than cancel_hours before the start.
import AccountMenu from '@/components/account-menu';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import MenuToggle from '@/components/menu-toggle';
import { useAccount } from '@/lib/account';
import { ROOM_OPENS_MINUTES, addMinutes, fetchMine, locksAt, roomInfo, timeOf, when, type Room } from '@/lib/rooms';
import { getSupabase, type MembershipSummary } from '@/lib/supabase';
import { useNow } from '@/lib/use-now';

const STATUS = {
  pending: 'Not started',
  active: 'Active',
  past_due: 'Payment due',
  paused: 'Paused',
  canceled: 'Canceled',
} as const;

const refillDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
};

interface Loaded {
  key: string;
  rooms: Room[] | null;
  summary: MembershipSummary | null;
}

export default function MySessionsPage() {
  const supabase = getSupabase();
  const { ready, account } = useAccount();
  const now = useNow();
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const key = `${account?.id ?? 'out'}|${tick}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!supabase || !account) return;
    let live = true;
    Promise.all([
      fetchMine(supabase),
      supabase.rpc('get_my_membership').then(({ data }) => data as MembershipSummary | null),
    ]).then(([rooms, summary]) => {
      if (live) setLoaded({ key, rooms, summary });
    });
    return () => {
      live = false;
    };
  }, [supabase, account, key]);

  // While a change reloads the list, keep showing the last one for the same person.
  const current = loaded && loaded.key.startsWith(`${account?.id ?? 'out'}|`) ? loaded : null;
  // The list is loaded once; a session that ends while the page is open drops off here.
  const booked = (current?.rooms ?? []).filter(
    (room) => room.my_booking_id && new Date(addMinutes(room.starts_at, room.minutes)).getTime() > now,
  );
  const s = current?.summary ?? null;

  const run = async (id: string, fn: 'cancel_booking' | 'set_booking_camera', args: Record<string, unknown>) => {
    if (!supabase) return;
    setBusy(id);
    setToast(null);
    const { data, error } = await supabase.rpc(fn, args);
    const res = data as { success: boolean; error?: string; message?: string } | null;
    setBusy(null);
    if (error || !res?.success) {
      setToast({ text: res?.error || 'That didn’t work. Please try again.', error: true });
      return;
    }
    if (res.message) setToast({ text: res.message, error: false });
    setTick((t) => t + 1);
  };

  const cancel = (room: Room) => {
    const free = new Date(room.cancel_by).getTime() > now;
    const ok = window.confirm(
      free
        ? `Cancel ${room.title}? Your credit comes back.`
        : `Cancel ${room.title}? The free cancellation time has passed, so the credit is used.`,
    );
    if (ok && room.my_booking_id) void run(room.my_booking_id, 'cancel_booking', { p_booking_id: room.my_booking_id });
  };

  const header = (
    <header className="schedule-nav member-nav">
      <Link className="schedule-mark" href="/" aria-label="MeetDoConnect home">
        <span>Meet</span>
        <span>Do</span>
        <span>Connect</span>
      </Link>
      <nav aria-label="Member navigation">
        <Link href="/calendar">Calendar</Link>
        <Link className="active" href="/sessions">
          My sessions
        </Link>
        <Link href="/membership">Membership</Link>
      </nav>
      <AccountMenu
        signedOut={
          <Link className="schedule-signin" href="/signin">
            Sign in
          </Link>
        }
      />
      <MenuToggle />
    </header>
  );

  if (!supabase || (ready && !account)) {
    return (
      <main className="sessions-page">
        {header}
        <section className="sessions-hero">
          <div>
            <p className="section-label">My sessions</p>
            <h1>
              Sign in to see
              <br />
              <span>your sessions.</span>
            </h1>
          </div>
          <Link className="browse-more" href={{ pathname: '/signin', query: { next: '/sessions' } }}>
            Sign in <span aria-hidden="true">↗</span>
          </Link>
        </section>
      </main>
    );
  }

  const weekLeft = s && s.week_limit !== null ? Math.max(s.week_limit - s.week_used, 0) : null;

  return (
    <main className="sessions-page">
      {header}

      <section className="sessions-hero">
        <div>
          <p className="section-label">My sessions</p>
          <h1>
            {booked.length > 0 ? 'Your week has' : 'Nothing booked'}
            <br />
            <span>{booked.length > 0 ? 'good things in it.' : 'yet. Pick an hour.'}</span>
          </h1>
        </div>
        <Link className="browse-more" href="/calendar">
          Browse more sessions <span aria-hidden="true">↗</span>
        </Link>
      </section>

      {s && (
        <section className="member-balance" aria-label="Member balances">
          <div>
            <span>This week</span>
            <strong>{weekLeft === null ? 'No weekly limit' : `${weekLeft} of ${s.week_limit} left`}</strong>
            {s.week_limit !== null && (
              <div className="balance-pips" aria-hidden="true">
                {Array.from({ length: s.week_limit }, (_, i) => (
                  <i key={i} className={i < s.week_used ? 'used' : undefined} />
                ))}
              </div>
            )}
            <small>
              Week resets Monday · {s.monthly_left} of {s.monthly_total} left this month
              {s.week_limit_shared ? ' (shared)' : ''}
            </small>
          </div>
          <div>
            <span>Extra sessions</span>
            <strong>{s.addon_left} available</strong>
            <Link href="/membership#credits">Buy extras</Link>
            <small>Extras never expire</small>
          </div>
          <div>
            <span>Bad Hair Day cards</span>
            <strong>
              {s.bhd_left} of {s.bhd_total} left
            </strong>
            <div className="balance-pips card-pips" aria-hidden="true">
              {Array.from({ length: s.bhd_total }, (_, i) => (
                <i key={i} className={i < s.bhd_left ? undefined : 'used'} />
              ))}
            </div>
            <small>Resets on the 1st of each month</small>
          </div>
          <div className="membership-mini-status">
            <span>Membership</span>
            <strong>{STATUS[s.payment_status]}</strong>
            <Link href="/membership">Manage</Link>
            <small>Next monthly sessions {refillDay(s.next_refill)}</small>
          </div>
        </section>
      )}

      {toast && (
        <div className={toast.error ? 'sessions-toast is-error' : 'sessions-toast'} role="status">
          {toast.text}
        </div>
      )}

      <section className="upcoming-sessions">
        <div className="upcoming-heading">
          <p className="section-label">Coming up</p>
          <p>{current ? `${booked.length} booked` : 'Loading…'}</p>
        </div>

        {current?.rooms === null && (
          <p className="calendar-empty">We couldn’t load your sessions. Refresh to try again.</p>
        )}
        {current && current.rooms !== null && booked.length === 0 && (
          <p className="calendar-empty">
            No sessions booked. <Link href="/calendar">Open the calendar</Link> to pick one.
          </p>
        )}

        <div className="booked-list" aria-busy={!current}>
          {booked.map((room) => {
            const info = roomInfo(room);
            const at = when(room.starts_at);
            const isOff = Boolean(room.my_camera_off);
            const bookingId = room.my_booking_id as string;
            const opens = new Date(addMinutes(room.starts_at, -ROOM_OPENS_MINUTES)).getTime();
            const closes = new Date(locksAt(room)).getTime();
            const started = new Date(room.starts_at).getTime() <= now;
            const freeCancel = new Date(room.cancel_by).getTime() > now;
            return (
              <article className="booked-session" key={room.id}>
                <div className={`booking-color tone-${info.tone}`} aria-hidden="true" />
                <div className="booked-date">
                  <span>{at.weekday}</span>
                  <strong>{at.date}</strong>
                  <span>{at.month}</span>
                </div>
                <div className="booked-main">
                  <div className="booked-title-line">
                    <div>
                      <p>
                        {at.long} · {at.time}–{timeOf(addMinutes(room.starts_at, room.minutes))}
                      </p>
                      <h2>{room.title}</h2>
                    </div>
                    <span className={`camera-tag ${isOff ? 'off' : ''}`}>{isOff ? 'Camera off' : 'Camera on'}</span>
                  </div>
                  <p className="booked-meta">
                    {info.forWhom} · {room.booked} attending · {room.minutes} minutes
                  </p>
                  <div className="booked-prep">
                    <strong>Bring this</strong>
                    <p>{info.prep}</p>
                    <Link href={{ pathname: '/book', query: { s: room.slug } }}>
                      Open full prep card <span aria-hidden="true">↗</span>
                    </Link>
                  </div>
                  {!started && (
                    <div className="booked-controls">
                      <label className="small-card-toggle">
                        <input
                          type="checkbox"
                          checked={isOff}
                          disabled={busy !== null}
                          onChange={(event) =>
                            void run(bookingId, 'set_booking_camera', {
                              p_booking_id: bookingId,
                              p_camera_off: event.target.checked,
                            })
                          }
                        />
                        <span aria-hidden="true" />
                        <b>Bad Hair Day card</b>
                      </label>
                      <button type="button" disabled={busy !== null} onClick={() => cancel(room)}>
                        {busy === bookingId ? 'Working…' : 'Cancel session'}
                      </button>
                      <span>
                        {freeCancel
                          ? `Free cancel until ${when(room.cancel_by).weekday} ${timeOf(room.cancel_by)}`
                          : 'Credit is kept if you cancel now'}
                      </span>
                    </div>
                  )}
                </div>
                <div className="join-session">
                  {room.my_held || (s?.hello_required && s.hello_status !== 'approved') ? (
                    <>
                      <strong>Waiting for approval</strong>
                      <p>
                        Your seat is saved. Rooms open for you once your Hello Video is approved.
                        {(s?.hello_status === 'none' || s?.hello_status === 'rejected') && (
                          <>
                            {' '}
                            <Link href="/hello-video">Record it now</Link>
                          </>
                        )}
                      </p>
                      <button type="button" disabled>
                        Join room
                      </button>
                    </>
                  ) : now >= opens && now <= closes ? (
                    <>
                      <span className="room-open-dot" />
                      <strong>Room is open</strong>
                      <p>Closes at {timeOf(locksAt(room))}</p>
                      <Link href={{ pathname: '/camera-check', query: { s: room.slug } }}>
                        Join room <span aria-hidden="true">→</span>
                      </Link>
                    </>
                  ) : now > closes ? (
                    <>
                      <strong>In progress</strong>
                      <p>The room closed to new arrivals at {timeOf(locksAt(room))}.</p>
                      <button type="button" disabled>
                        Join room
                      </button>
                    </>
                  ) : (
                    <>
                      <strong>Not open yet</strong>
                      <p>Room opens at {timeOf(addMinutes(room.starts_at, -ROOM_OPENS_MINUTES))}.</p>
                      <button type="button" disabled>
                        Join room
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="sessions-help">
        <div>
          <p className="section-label">A change of plans?</p>
          <h2>Your seat can become someone else’s good evening.</h2>
        </div>
        <p>
          We hope you can make it—the room is better with you in it. If plans change, cancel at least 24 hours before
          the session and your session credit returns automatically. Within 24 hours, you can still release the seat,
          but the credit is used.
        </p>
      </section>
    </main>
  );
}
