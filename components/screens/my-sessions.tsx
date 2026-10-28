'use client';

import Link from 'next/link';
import { useState } from 'react';
import { getSession } from '@/lib/session-data';
import MenuToggle from '@/components/menu-toggle';

const bookings = [
  {
    session: getSession('quiet-co-work'),
    fullDate: 'Monday, May 18',
    time: '10:00–11:00 am',
    deadline: 'Monday at 7:00 am',
    joinState: 'open',
    attending: 7,
  },
  {
    session: getSession('botanical-sketch-night'),
    fullDate: 'Wednesday, May 20',
    time: '7:00–8:00 pm',
    deadline: 'Wednesday at 4:00 pm',
    joinState: 'waiting',
    attending: 8,
  },
  {
    session: getSession('share-a-song'),
    fullDate: 'Sunday, May 24',
    time: '6:30–7:30 pm',
    deadline: 'Sunday at 3:30 pm',
    joinState: 'waiting',
    attending: 5,
  },
];

export default function MySessionsPage() {
  const [cameraOff, setCameraOff] = useState<Record<string, boolean>>({});
  const [cancelled, setCancelled] = useState<string[]>([]);

  const cancelSession = (slug: string) => {
    setCancelled((current) => [...current, slug]);
  };

  return (
    <main className="sessions-page">
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
        <Link className="member-avatar" href="/membership" aria-label="Open account">
          KC
        </Link>
        <MenuToggle />
      </header>

      <section className="sessions-hero">
        <div>
          <p className="section-label">My sessions</p>
          <h1>
            Your week has
            <br />
            <span>good things in it.</span>
          </h1>
        </div>
        <Link className="browse-more" href="/calendar">
          Browse more sessions <span aria-hidden="true">↗</span>
        </Link>
      </section>

      <section className="member-balance" aria-label="Member balances">
        <div>
          <span>Weekly sessions</span>
          <strong>2 of 3 left</strong>
          <div className="balance-pips" aria-hidden="true">
            <i />
            <i />
            <i className="used" />
          </div>
          <small>Resets Monday</small>
        </div>
        <div>
          <span>Extra sessions</span>
          <strong>1 available</strong>
          <Link href="/membership#credits">Buy extras</Link>
          <small>Extras never expire</small>
        </div>
        <div>
          <span>Bad Hair Day cards</span>
          <strong>2 of 3 left</strong>
          <div className="balance-pips card-pips" aria-hidden="true">
            <i />
            <i />
            <i className="used" />
          </div>
          <small>Resets June 1</small>
        </div>
        <div className="membership-mini-status">
          <span>Membership</span>
          <strong>Active</strong>
          <Link href="/membership">Manage</Link>
          <small>Paid through June 8</small>
        </div>
      </section>

      {cancelled.length > 0 && (
        <div className="sessions-toast" role="status">
          <strong>Session cancelled.</strong> Your seat was released and the credit returned to this week.
        </div>
      )}

      <section className="upcoming-sessions">
        <div className="upcoming-heading">
          <p className="section-label">Coming up</p>
          <p>{bookings.length - cancelled.length} booked this week</p>
        </div>

        <div className="booked-list">
          {bookings
            .filter(({ session }) => !cancelled.includes(session.slug))
            .map((booking, index) => {
              const { session } = booking;
              const isOff = cameraOff[session.slug] ?? false;
              return (
                <article className="booked-session" key={session.slug}>
                  <div className={`booking-color tone-${session.tone}`} aria-hidden="true" />
                  <div className="booked-date">
                    <span>{session.day}</span>
                    <strong>{session.date}</strong>
                    <span>{session.month}</span>
                  </div>
                  <div className="booked-main">
                    <div className="booked-title-line">
                      <div>
                        <p>
                          {booking.fullDate} · {booking.time}
                        </p>
                        <h2>{session.title}</h2>
                      </div>
                      <span className={`camera-tag ${isOff ? 'off' : ''}`}>{isOff ? 'Camera off' : 'Camera on'}</span>
                    </div>
                    <p className="booked-meta">
                      {session.forWhom} · {booking.attending} attending · 60 minutes
                    </p>
                    <div className="booked-prep">
                      <strong>Bring this</strong>
                      <p>{session.prep}</p>
                      <Link href={`/book/${session.slug}`}>
                        Open full prep card <span aria-hidden="true">↗</span>
                      </Link>
                    </div>
                    <div className="booked-controls">
                      <label className="small-card-toggle">
                        <input
                          type="checkbox"
                          checked={isOff}
                          onChange={(event) =>
                            setCameraOff((current) => ({ ...current, [session.slug]: event.target.checked }))
                          }
                        />
                        <span aria-hidden="true" />
                        <b>Bad Hair Day card</b>
                      </label>
                      <button type="button" onClick={() => cancelSession(session.slug)}>
                        Cancel session
                      </button>
                      <span>Free cancel until {booking.deadline}</span>
                    </div>
                  </div>
                  <div className="join-session">
                    {booking.joinState === 'open' && index === 0 ? (
                      <>
                        <span className="room-open-dot" />
                        <strong>Room is open</strong>
                        <p>Closes at 10:10 am</p>
                        <Link href="/camera-check">
                          Join room <span aria-hidden="true">→</span>
                        </Link>
                      </>
                    ) : (
                      <>
                        <strong>Not open yet</strong>
                        <p>Room opens 10 minutes before the start.</p>
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
          We hope you can make it—the room is better with you in it. If plans change, cancel before the deadline and
          your weekly credit returns automatically. After the deadline, you can still release the seat, but the credit
          is used.
        </p>
      </section>
    </main>
  );
}
