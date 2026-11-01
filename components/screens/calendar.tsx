'use client';

import AccountMenu from '@/components/account-menu';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import InviteBanner from '@/components/invite-banner';
import MenuToggle from '@/components/menu-toggle';
import { useAccount } from '@/lib/account';
import { addDays, centralDay, fetchRooms, isOpen, mondayOf, roomInfo, seatLabel, when, type Room } from '@/lib/rooms';
import { getSupabase } from '@/lib/supabase';
import { useNow } from '@/lib/use-now';

const FILTERS = ['All sessions', 'Adults & teens', 'Families welcome', 'No preparation'] as const;
const WEEKS_AHEAD = 8;

function matches(room: Room, filter: string): boolean {
  const info = roomInfo(room);
  if (filter === 'Adults & teens') return /adults/i.test(info.audience) || /adults/i.test(info.forWhom);
  if (filter === 'Families welcome') return /famil/i.test(info.audience) || /famil/i.test(info.forWhom);
  if (filter === 'No preparation') return /^no prep/i.test(info.shortPrep);
  return true;
}

const dayLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const utc = (day: string) => new Date(`${day}T12:00:00Z`);

/** "Nov 2–8, 2026" or "Oct 26 – Nov 1, 2026" */
function weekLabel(monday: string): string {
  const sunday = addDays(monday, 6);
  const year = sunday.slice(0, 4);
  if (monday.slice(5, 7) === sunday.slice(5, 7))
    return `${dayLabel.format(utc(monday))}–${Number(sunday.slice(8))}, ${year}`;
  return `${dayLabel.format(utc(monday))} – ${dayLabel.format(utc(sunday))}, ${year}`;
}

/** Calendar cells for a month: Monday-first weeks, null outside the month. */
function monthCells(first: string): (string | null)[] {
  const start = mondayOf(first);
  const nextMonth = addDays(first, 32).slice(0, 8) + '01';
  const cells: (string | null)[] = [];
  for (let day = start; day < nextMonth || cells.length % 7 !== 0; day = addDays(day, 1)) {
    cells.push(day >= first && day < nextMonth ? day : null);
  }
  return cells;
}

const weeksBetween = (fromMonday: string, toMonday: string) =>
  Math.round((utc(toMonday).getTime() - utc(fromMonday).getTime()) / (7 * 864e5));

export default function SchedulePage() {
  const [view, setView] = useState<'week' | 'month'>('week');
  const [filter, setFilter] = useState<string>('All sessions');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const { ready, account } = useAccount();
  const now = useNow();
  const supabase = getSupabase();

  const today = centralDay();
  const thisMonday = mondayOf(today);
  const monday = addDays(thisMonday, weekOffset * 7);
  const firstOfMonth = (() => {
    const [y, m] = today.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1 + monthOffset, 1)).toISOString().slice(0, 10);
  })();
  const cells = monthCells(firstOfMonth);
  const [from, to] =
    view === 'week'
      ? [monday, addDays(monday, 7)]
      : [cells[0] ?? firstOfMonth, addDays(cells[cells.length - 1] ?? firstOfMonth, 1)];
  // Reload when the range or the signed-in person changes (their own seats show as Booked).
  const key = `${from}|${to}|${ready ? (account?.id ?? 'out') : 'wait'}`;
  const [loaded, setLoaded] = useState<{ key: string; rooms: Room[] | null } | null>(null);

  useEffect(() => {
    if (!supabase || !ready) return;
    let live = true;
    fetchRooms(supabase, from, to).then((rooms) => {
      if (live) setLoaded({ key, rooms });
    });
    return () => {
      live = false;
    };
  }, [supabase, ready, from, to, key]);

  const current = loaded?.key === key ? loaded : null;
  const rooms = (current?.rooms ?? []).filter((room) => matches(room, filter));
  const loading = Boolean(supabase) && !current;
  const failed = current?.rooms === null;
  const byDay = new Map<string, Room[]>();
  for (const room of rooms) {
    const day = centralDay(new Date(room.starts_at));
    byDay.set(day, [...(byDay.get(day) ?? []), room]);
  }

  return (
    <main className="schedule-page">
      <header className="schedule-nav">
        <Link className="schedule-mark" href="/" aria-label="MeetDoConnect home">
          <span>Meet</span>
          <span>Do</span>
          <span>Connect</span>
        </Link>
        <nav aria-label="Schedule navigation">
          <Link href="/">Home</Link>
          <Link className="active" href="/calendar">
            Calendar
          </Link>
          <Link href="/#rooms">Rooms</Link>
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

      <section className="schedule-hero">
        <div>
          <p className="section-label">Schedule</p>
          <h1>
            Pick an hour.
            <br />
            <span>Come as you are.</span>
          </h1>
        </div>
        <div className="public-note">
          <span className="note-dot" />
          <div>
            {account ? (
              <>
                <strong>Hi {account.name.split(' ')[0]}, pick your next hour</strong>
                <p>Tap Book on any open session. Your seats show as Booked. Member names stay private.</p>
              </>
            ) : (
              <>
                <strong>You’re viewing the public calendar</strong>
                <p>Session times and attendance totals are public. Member names stay private.</p>
              </>
            )}
          </div>
        </div>
      </section>

      <InviteBanner place="calendar" />

      <section className="schedule-shell">
        <aside className="schedule-sidebar">
          <div className="membership-status">
            <p className="section-label">Weekly sessions</p>
            <strong>3 or 4 a week</strong>
            <p>
              Solo includes 13 sessions a month and Household 16 shared. Book up to 4 a week, Monday–Sunday. Household
              members share those 4.
            </p>
            <Link href="/membership">
              See membership <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <div className="schedule-facts">
            <div>
              <span>01</span>
              <p>
                <strong>One credit</strong> per session
              </p>
            </div>
            <div>
              <span>02</span>
              <p>
                <strong>5–12 people</strong> in a room
              </p>
            </div>
            <div>
              <span>03</span>
              <p>
                <strong>60 minutes</strong> to do something together
              </p>
            </div>
          </div>
        </aside>

        <div className="calendar-area">
          <div className="calendar-toolbar">
            <div>
              <div className="week-range-control">
                <button
                  type="button"
                  aria-label={view === 'week' ? 'Previous week' : 'Previous month'}
                  disabled={view === 'week' ? weekOffset === 0 : monthOffset === 0}
                  onClick={() => {
                    if (view === 'week') setWeekOffset((n) => n - 1);
                    else setMonthOffset((n) => n - 1);
                    setExpanded(null);
                  }}
                >
                  <span aria-hidden="true">←</span>
                </button>
                <p className="calendar-range" aria-live="polite">
                  {view === 'week' ? weekLabel(monday) : monthLabel.format(utc(firstOfMonth))}
                </p>
                <button
                  type="button"
                  aria-label={view === 'week' ? 'Next week' : 'Next month'}
                  disabled={view === 'week' ? weekOffset >= WEEKS_AHEAD : monthOffset >= 2}
                  onClick={() => {
                    if (view === 'week') setWeekOffset((n) => n + 1);
                    else setMonthOffset((n) => n + 1);
                    setExpanded(null);
                  }}
                >
                  <span aria-hidden="true">→</span>
                </button>
              </div>
              <p className="timezone">Times shown in your local time · Central in booking details</p>
            </div>
            <div className="toolbar-actions">
              <label>
                <span className="sr-only">Filter sessions</span>
                <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                  {FILTERS.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              <div className="view-switch" aria-label="Calendar view">
                <button className={view === 'week' ? 'selected' : ''} type="button" onClick={() => setView('week')}>
                  Week
                </button>
                <button className={view === 'month' ? 'selected' : ''} type="button" onClick={() => setView('month')}>
                  Month
                </button>
              </div>
            </div>
          </div>

          <div className="reminder-bar">
            <p>
              <strong>Want reminders?</strong> Get a notification 24 hours and 1 hour before each session.
            </p>
            <Link href="/reminders">
              Set up reminders <span aria-hidden="true">→</span>
            </Link>
          </div>

          {failed && <p className="calendar-empty">We couldn’t load the sessions. Refresh to try again.</p>}
          {!supabase && <p className="calendar-empty">Sessions appear here once the database is connected.</p>}
          {view === 'week' ? (
            <div className="session-list" aria-busy={loading}>
              {loading && <p className="calendar-empty">Loading sessions…</p>}
              {!loading && !failed && rooms.length === 0 && (
                <p className="calendar-empty">
                  {filter === 'All sessions' ? 'No sessions this week yet.' : `No “${filter}” sessions this week.`}
                  {weekOffset < WEEKS_AHEAD && (
                    <button type="button" onClick={() => setWeekOffset((n) => n + 1)}>
                      See next week <span aria-hidden="true">→</span>
                    </button>
                  )}
                </p>
              )}
              {rooms.map((room) => {
                const info = roomInfo(room);
                const at = when(room.starts_at);
                const seats = seatLabel(room);
                const open = isOpen(room, now);
                const started = new Date(room.starts_at).getTime() <= now;
                const isExpanded = expanded === room.id;
                return (
                  <article className={`session-row ${isExpanded ? 'expanded' : ''}`} key={room.id}>
                    <div className="session-date">
                      <span>{at.weekday}</span>
                      <strong>{at.date}</strong>
                    </div>
                    <div className="session-time">{at.time}</div>
                    <div className="session-main">
                      <span className={`session-swatch tone-${info.tone}`} />
                      <div>
                        <h2>{room.title}</h2>
                        <p>
                          {info.audience} · {room.minutes} min · 1 credit
                        </p>
                      </div>
                    </div>
                    <div className={`seat-count ${room.my_booking_id ? 'mine' : seats.limited ? 'limited' : ''}`}>
                      {room.my_booking_id ? (room.my_held ? 'Booked · held' : 'You’re booked') : seats.text}
                    </div>
                    <div className="session-actions">
                      <button
                        className="session-more"
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() => setExpanded(isExpanded ? null : room.id)}
                      >
                        {isExpanded ? 'Close' : 'Details'}
                      </button>
                      {room.my_booking_id ? (
                        <Link className="booked" href="/sessions">
                          Booked
                        </Link>
                      ) : open ? (
                        <Link href={{ pathname: '/book', query: { s: room.slug } }}>Book</Link>
                      ) : (
                        <span>{started ? 'Ended' : seats.text === 'Full' ? 'Full' : 'Closed'}</span>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="session-detail">
                        <p>
                          <strong>Bring this:</strong> {info.shortPrep}
                        </p>
                        <p>
                          {account
                            ? `Hosted by ${room.host}. Member names are shown only inside the room.`
                            : 'Sign in or join to reserve a seat. Member names are shown only inside the room.'}
                        </p>
                        <Link href={{ pathname: '/book', query: { s: room.slug } }}>
                          Open booking page <span aria-hidden="true">↗</span>
                        </Link>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="month-view" aria-busy={loading}>
              <div className="weekday-row">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="month-grid">
                {cells.map((day, index) => {
                  const list = day ? (byDay.get(day) ?? []) : [];
                  const tone = list[0] ? roomInfo(list[0]).tone : 'ink';
                  return (
                    <div className={`month-day ${day === today ? 'today' : ''}`} key={day ?? `pad-${index}`}>
                      {day && <strong>{Number(day.slice(8))}</strong>}
                      {day && list.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setWeekOffset(Math.max(0, weeksBetween(thisMonday, mondayOf(day))));
                            setView('week');
                          }}
                          className={`day-events tone-${tone}`}
                        >
                          {list.length} {list.length === 1 ? 'session' : 'sessions'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="schedule-cta" id="membership">
        <p className="section-label">Ready to book?</p>
        <h2>
          Three good reasons
          <br />
          to look forward to the week.
        </h2>
        <div className="schedule-join-links">
          <Link href="/signup">
            Join MeetDoConnect <span aria-hidden="true">↗</span>
          </Link>
          <Link href="/terms" target="_blank" rel="noreferrer">
            Terms & Conditions
          </Link>
        </div>
      </section>
    </main>
  );
}
