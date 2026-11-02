'use client';

// Booking page for one session, read from the database (get_schedule by slug). Works for the twelve
// catalog rooms (/book/<room>) and for any session an admin adds (/book?s=<slug>). Credits and Bad Hair
// Day cards come from get_my_membership(); book_session() does the real checks and takes the credit.
import AccountMenu from '@/components/account-menu';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { sendBuddyMessage } from '@/lib/buddies';
import { updateBuddyDemo, useBuddyDemo } from '@/lib/buddy-demo';
import { useAccount } from '@/lib/account';
import {
  ROOM_LOCKS_MINUTES,
  ROOM_OPENS_MINUTES,
  addMinutes,
  fetchRoom,
  roomInfo,
  seatLabel,
  seatsLeft,
  timeOf,
  when,
  type Room,
} from '@/lib/rooms';
import { getSupabase, type MembershipSummary } from '@/lib/supabase';
import { useNow } from '@/lib/use-now';
import InviteBanner from '@/components/invite-banner';
import MenuToggle from '@/components/menu-toggle';

function Header({ active }: { active: boolean }) {
  return (
    <header className="schedule-nav">
      <Link className="schedule-mark" href="/" aria-label="MeetDoConnect home">
        <span>Meet</span>
        <span>Do</span>
        <span>Connect</span>
      </Link>
      <nav aria-label="Booking navigation">
        <Link href="/">Home</Link>
        <Link className={active ? 'active' : undefined} href="/calendar">
          Calendar
        </Link>
        <Link href="/sessions">My sessions</Link>
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
}

/** /book?s=<slug> */
export function BookFromQuery() {
  const slug = useSearchParams().get('s') ?? '';
  return <BookPage slug={slug} />;
}

interface Loaded {
  key: string;
  room: Room | null | undefined;
  summary: MembershipSummary | null;
}

export default function BookPage({ slug }: { slug: string }) {
  const [cameraOff, setCameraOff] = useState(false);
  const [confirmed, setConfirmed] = useState<{ held: boolean; extra: boolean } | null>(null);
  const [invited, setInvited] = useState<{ name: string; id: string | null; error: string } | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [isBooking, setIsBooking] = useState(false);
  const { inviting, invitingId } = useBuddyDemo();
  const { ready, account } = useAccount();
  const now = useNow();
  const supabase = getSupabase();
  const key = `${slug}|${ready ? (account?.id ?? 'out') : 'wait'}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!supabase || !ready || !slug) return;
    let live = true;
    Promise.all([
      fetchRoom(supabase, slug),
      account ? supabase.rpc('get_my_membership').then(({ data }) => data as MembershipSummary | null) : null,
    ]).then(([room, summary]) => {
      if (live) setLoaded({ key, room, summary });
    });
    return () => {
      live = false;
    };
  }, [supabase, ready, slug, key, account]);

  const current = loaded?.key === key ? loaded : null;
  const room = current?.room;
  const summary = current?.summary ?? null;

  if (!slug || current?.room === null || current?.room === undefined) {
    const message = !slug
      ? 'Pick a session on the calendar to book it.'
      : !supabase
        ? 'Booking opens once the database is connected.'
        : !current
          ? null
          : current.room === null
            ? 'This session isn’t on the calendar anymore. It may have been moved or taken down.'
            : 'We couldn’t load this session. Refresh to try again.';
    return (
      <main className="booking-page">
        <Header active />
        <section className="confirmation-screen" aria-busy={!message}>
          <p className="section-label">Book a session</p>
          <h1>{message ? 'Let’s find you a room.' : 'Loading the session…'}</h1>
          {message && <p className="confirmation-note">{message}</p>}
          {message && (
            <div className="confirmation-actions">
              <Link className="primary-booking-action" href="/calendar">
                Back to calendar
              </Link>
            </div>
          )}
        </section>
      </main>
    );
  }

  const session = room as Room;
  const info = roomInfo(session);
  const card = info.card;
  const at = when(session.starts_at);
  const opensAt = timeOf(addMinutes(session.starts_at, -ROOM_OPENS_MINUTES));
  const closed = now > 0 && new Date(session.closes_at).getTime() <= now;
  const full = seatsLeft(session) === 0;
  const bhdLeft = summary?.bhd_left ?? 0;
  const usesExtra = Boolean(summary && summary.monthly_left === 0 && summary.addon_left > 0);

  const confirm = async () => {
    if (!supabase) return;
    setBookingError(null);
    setIsBooking(true);
    const { data, error } = await supabase.rpc('book_session', {
      p_session_id: session.id,
      p_camera_off: cameraOff,
    });
    const res = data as { success: boolean; error?: string; held?: boolean; credit_type?: string } | null;
    setIsBooking(false);
    if (error || !res?.success) {
      setBookingError(res?.error || 'We couldn’t save your seat. Please try again.');
      return;
    }
    if (inviting) {
      // The invitation card lands in the Buddy Room for both people.
      const sent = invitingId
        ? await sendBuddyMessage(
            supabase,
            invitingId,
            'session',
            `Join me at ${session.title}, ${at.long} at ${at.time}?`,
            { slug: session.slug },
          )
        : '';
      updateBuddyDemo((demo) => ({
        ...demo,
        inviting: null,
        invitingId: null,
        sessionInvites: { ...demo.sessionInvites, [inviting]: session.slug },
      }));
      setInvited({ name: inviting, id: invitingId, error: sent });
    }
    setConfirmed({ held: Boolean(res.held), extra: res.credit_type === 'addon' });
  };

  if (confirmed) {
    return (
      <main className="booking-page">
        <Header active={false} />
        <section className="confirmation-screen" aria-live="polite">
          <div className="confirmation-mark" aria-hidden="true">
            ✓
          </div>
          <p className="section-label">{confirmed.held ? 'Your seat is held' : 'Your seat is saved'}</p>
          <h1>
            See you at
            <br />
            {session.title}.
          </h1>
          <div className="confirmation-summary">
            <div>
              <span>When</span>
              <strong>
                {at.long} · {at.time}
              </strong>
            </div>
            <div>
              <span>Camera</span>
              <strong>{cameraOff ? 'Off · Bad Hair Day card used' : 'On · faces make this work'}</strong>
            </div>
            <div>
              <span>Room opens</span>
              <strong>{opensAt}</strong>
            </div>
          </div>
          <p className="confirmation-note">
            {confirmed.held
              ? 'Your seat is held until your Hello Video is approved. The Join button turns on after that. '
              : ''}
            {confirmed.extra ? 'This booking used one of your extra sessions. ' : ''}
            Your prep card stays in My sessions. Reminders go out 24 hours and 1 hour before if you turned them on.
            {invited &&
              (invited.error
                ? ` Your seat is saved, but the invitation to ${invited.name} didn’t go through: ${invited.error}`
                : ` ${invited.name} gets the invitation in your Buddy Room and confirms with their own credit.`)}
          </p>
          <div className="confirmation-actions">
            {invited && (
              <Link
                className="primary-booking-action"
                href={invited.id ? { pathname: '/after-session', query: { buddy: invited.id } } : '/after-session'}
                onClick={() => updateBuddyDemo((demo) => ({ ...demo, chat: invited.name }))}
              >
                Back to chat with {invited.name}
              </Link>
            )}
            <Link className={invited ? 'secondary-booking-action' : 'primary-booking-action'} href="/sessions">
              View my sessions
            </Link>
            <Link className="secondary-booking-action" href="/calendar">
              Back to calendar
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="booking-page">
      <Header active />

      <div className="booking-back">
        <Link href="/calendar">
          <span aria-hidden="true">←</span> Back to the calendar
        </Link>
      </div>

      <section className="booking-layout">
        <div className="booking-main">
          <div className="booking-title">
            <div className="booking-date-block">
              <span>{at.weekday}</span>
              <strong>{at.date}</strong>
              <span>{at.month}</span>
            </div>
            <div>
              <p className="section-label">Live session · {session.minutes} minutes</p>
              <h1>{session.title}</h1>
            </div>
          </div>

          <div className="booking-intro">
            <p>
              {info.description ??
                'Everything you need to arrive prepared and enjoy this session is collected below. Come as you are; the activity gives everyone an easy place to begin.'}
            </p>
            <div className="booking-tags">
              <span>{info.forWhom}</span>
              <span>{seatLabel(session).text}</span>
              <span>Hosted by {session.host}</span>
            </div>
          </div>

          <div className="prep-panel">
            <div className="prep-panel-heading">
              <p className="section-label">Your prep card</p>
              <span>Review before your session</span>
            </div>
            <h2>What to bring</h2>
            <p className="full-prep-copy">{info.prep}</p>
            <div className="full-prep-details">
              {card?.ideas && (
                <>
                  <p className="detail-label">Ideas & prompts</p>
                  <div className="idea-list">
                    {card.ideas.map((idea) => (
                      <span key={idea}>{idea}</span>
                    ))}
                  </div>
                </>
              )}
              {card?.note && (
                <p className="booking-safety-note">
                  <strong>Please note:</strong> {card.note}
                </p>
              )}
            </div>
          </div>

          <div className="run-panel">
            <p className="section-label">How the hour flows</p>
            <p className="full-run-copy">
              {card?.run ??
                '5 min: Say hello. Most of the hour: do the activity together, cameras on. Last few minutes: a short check-out where everyone shares one thing.'}
            </p>
            <div className="session-expectations">
              <div>
                <span>Starter</span>
                <p>Welcomes the room and opens the five-minute check-in.</p>
              </div>
              <div>
                <span>Timekeeper</span>
                <p>Gently signals when focused work and check-out begin.</p>
              </div>
              <div>
                <span>Closer</span>
                <p>Wraps up the room and makes sure everyone gets a final word.</p>
              </div>
            </div>
          </div>
        </div>

        <aside className="booking-checkout">
          <InviteBanner place="book" />
          <div className="checkout-card">
            <p className="section-label">{session.my_booking_id ? 'You’re booked' : 'Confirm your seat'}</p>
            <div className="checkout-time">
              <strong>
                {at.weekday}, {at.month} {at.date}
              </strong>
              <span>{at.time} local time</span>
              <span>{at.central} (Central)</span>
            </div>
            <div className="credit-cost">
              <span>Booking cost</span>
              <strong>1 credit</strong>
            </div>
            {summary && (
              <div className="credit-balance">
                <div>
                  <span>{usesExtra ? 'Extra sessions' : 'Your month'}</span>
                  <strong>
                    {usesExtra
                      ? `${summary.addon_left} extra left`
                      : `${summary.monthly_left} of ${summary.monthly_total} credits left`}
                  </strong>
                </div>
                {summary.week_limit !== null && (
                  <div
                    className="credit-pips"
                    style={{ gridTemplateColumns: `repeat(${summary.week_limit}, 1fr)` }}
                    aria-label={`${Math.max(summary.week_limit - summary.week_used, 0)} of ${summary.week_limit} left this week`}
                  >
                    {Array.from({ length: summary.week_limit }, (_, i) => (
                      <span key={i} style={i < summary.week_used ? { background: 'none' } : undefined} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {session.my_booking_id ? (
              <>
                <p className="cancel-copy">
                  {session.my_held
                    ? 'Your seat is held until your Hello Video is approved.'
                    : `Camera ${session.my_camera_off ? 'off (Bad Hair Day card)' : 'on'}. Change it or cancel in My sessions.`}
                </p>
                <Link className="confirm-booking" href="/sessions">
                  Open My sessions <span aria-hidden="true">→</span>
                </Link>
              </>
            ) : !account ? (
              <>
                <p className="cancel-copy">Sign in to book with one of your credits. New here? Join first.</p>
                <Link
                  className="confirm-booking"
                  href={{ pathname: '/signin', query: { next: `/book?s=${session.slug}` } }}
                >
                  Sign in to book <span aria-hidden="true">→</span>
                </Link>
                <Link className="secondary-booking-action" href="/signup">
                  Join MeetDoConnect
                </Link>
              </>
            ) : (
              <>
                <label className="camera-choice">
                  <input
                    type="checkbox"
                    checked={cameraOff}
                    disabled={bhdLeft === 0}
                    onChange={(event) => setCameraOff(event.target.checked)}
                  />
                  <span className="choice-control" aria-hidden="true" />
                  <span>
                    <strong>Use a Bad Hair Day card</strong>
                    Join with your camera off.{' '}
                    {summary ? `You have ${bhdLeft} of ${summary.bhd_total} left this month.` : ''}
                  </span>
                </label>

                <div className="camera-result">
                  <span className={cameraOff ? 'camera-off' : 'camera-on'} />
                  <div>
                    <strong>{cameraOff ? 'Camera off' : 'Camera on'}</strong>
                    <p>
                      {cameraOff
                        ? 'Your profile photo appears in the room.'
                        : 'Faces make this work. See you in a moment.'}
                    </p>
                  </div>
                </div>

                {bookingError && (
                  <div className="booking-error" role="alert">
                    {bookingError}
                  </div>
                )}

                <button
                  className="confirm-booking"
                  type="button"
                  onClick={confirm}
                  disabled={isBooking || closed || full}
                >
                  {closed
                    ? 'Booking has closed'
                    : full
                      ? 'This session is full'
                      : isBooking
                        ? 'Saving seat...'
                        : inviting
                          ? `Confirm & invite ${inviting}`
                          : 'Confirm with 1 credit'}{' '}
                  {!closed && !full && <span aria-hidden="true">→</span>}
                </button>
                <p className="cancel-copy">
                  Free cancellation until {when(session.cancel_by).long}, {timeOf(session.cancel_by)}. After that, you
                  can release the seat but the credit is used.
                </p>
              </>
            )}
          </div>
          <div className="booking-help">
            <strong>Booking closes at {timeOf(session.closes_at)}.</strong>
            <p>
              The room opens at {opensAt} and closes to new arrivals {ROOM_LOCKS_MINUTES} minutes after the start.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
