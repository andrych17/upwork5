'use client';

import Link from 'next/link';
import { useState } from 'react';
import InviteBanner from '@/components/invite-banner';
import MenuToggle from '@/components/menu-toggle';

type Session = {
  slug: string;
  day: string;
  date: string;
  time: string;
  title: string;
  audience: string;
  seats: string;
  tone: string;
  prep: string;
};

const sessions: Session[] = [
  {
    slug: 'quiet-co-work',
    day: 'Mon',
    date: '18',
    time: '10:00 am',
    title: 'Quiet Co-Work',
    audience: 'Adults & teens',
    seats: '7 attending',
    tone: 'navy',
    prep: 'One task, a drink, and your phone out of reach.',
  },
  {
    slug: 'wind-down',
    day: 'Mon',
    date: '18',
    time: '7:00 pm',
    title: 'Wind-Down',
    audience: 'Everyone',
    seats: '5 attending',
    tone: 'plum',
    prep: 'Blanket, herbal tea, journal, and pen.',
  },
  {
    slug: 'write-together',
    day: 'Tue',
    date: '19',
    time: '6:30 pm',
    title: 'Write Together',
    audience: 'Adults & teens',
    seats: '3 seats left',
    tone: 'berry',
    prep: 'Notebook or blank document and a favorite drink.',
  },
  {
    slug: 'botanical-sketch-night',
    day: 'Wed',
    date: '20',
    time: '7:00 pm',
    title: 'Botanical Sketch Night',
    audience: 'Adults & teens',
    seats: '8 attending',
    tone: 'leaf',
    prep: 'Paper, pencil, black pen, and a leaf or herb sprig.',
  },
  {
    slug: 'skin-ritual',
    day: 'Wed',
    date: '20',
    time: '8:30 pm',
    title: 'Skin Ritual',
    audience: 'Teens, solos & couples',
    seats: '6 attending',
    tone: 'sky',
    prep: 'Ground oats, yogurt or banana, honey, cooled green tea, cucumber, and mint.',
  },
  {
    slug: 'cards-and-collage-night',
    day: 'Thu',
    date: '21',
    time: '5:30 pm',
    title: 'Cards & Collage',
    audience: 'Families welcome',
    seats: '2 seats left',
    tone: 'cobalt',
    prep: 'Scrap paper, magazines, glue stick, scissors, and card stock.',
  },
  {
    slug: 'idea-lab',
    day: 'Fri',
    date: '22',
    time: '7:30 pm',
    title: 'Idea Lab',
    audience: 'Adults & teens',
    seats: '6 attending',
    tone: 'gold',
    prep: 'A half-formed idea and a short elevator pitch.',
  },
  {
    slug: 'mocktail-studio',
    day: 'Sat',
    date: '23',
    time: '7:00 pm',
    title: 'Mocktail Studio',
    audience: 'Families welcome',
    seats: '1 seat left',
    tone: 'coral',
    prep: 'Cranberry, ginger, sparkling water, lime, and rosemary.',
  },
  {
    slug: 'byo-dad-jokes',
    day: 'Sat',
    date: '23',
    time: '8:30 pm',
    title: 'BYO Dad Jokes (a really punny session...)',
    audience: 'Families, adults & teens',
    seats: '8 attending',
    tone: 'tomato',
    prep: 'Bring your groan-iest one-liner, story, or pun.',
  },
  {
    slug: 'dont-spill-the-tea',
    day: 'Sun',
    date: '24',
    time: '4:00 pm',
    title: "(Don't) Spill the Tea",
    audience: 'Couples, friends & solos',
    seats: '3 seats left',
    tone: 'sage',
    prep: 'Three mystery teas, a kettle, two mugs, and a tasting card.',
  },
  {
    slug: 'share-a-song',
    day: 'Sun',
    date: '24',
    time: '6:30 pm',
    title: 'Share a Song',
    audience: 'Adults & teens',
    seats: '5 attending',
    tone: 'violet',
    prep: 'A second device for playing a favorite song and your playlist.',
  },
  {
    slug: 'trivia-trivier-triviest',
    day: 'Sun',
    date: '24',
    time: '8:00 pm',
    title: 'Trivia, Trivier, Triviest',
    audience: 'Adults & teens',
    seats: '9 attending',
    tone: 'ink',
    prep: 'No prep. Just show up and guess.',
  },
];

const monthDays = Array.from({ length: 35 }, (_, index) => {
  const number = index - 3;
  return number > 0 && number <= 31 ? number : null;
});

const eventDays: Record<number, { count: number; tone: string }> = {
  2: { count: 2, tone: 'berry' },
  4: { count: 1, tone: 'navy' },
  6: { count: 3, tone: 'leaf' },
  9: { count: 1, tone: 'gold' },
  12: { count: 2, tone: 'cobalt' },
  14: { count: 1, tone: 'coral' },
  18: { count: 2, tone: 'navy' },
  19: { count: 1, tone: 'berry' },
  20: { count: 1, tone: 'leaf' },
  21: { count: 1, tone: 'cobalt' },
  22: { count: 1, tone: 'gold' },
  23: { count: 1, tone: 'coral' },
  24: { count: 1, tone: 'ink' },
  27: { count: 2, tone: 'plum' },
  30: { count: 1, tone: 'berry' },
};

export default function SchedulePage() {
  const [view, setView] = useState<'week' | 'month'>('week');
  const [filter, setFilter] = useState('All sessions');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const weekLabels = ['May 11–17, 2026', 'May 18–24, 2026', 'May 25–31, 2026'];

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
        <Link className="schedule-signin" href="/signin">
          Sign in
        </Link>
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
            <strong>You’re viewing the public calendar</strong>
            <p>Session times and attendance totals are public. Member names stay private.</p>
          </div>
        </div>
      </section>

      <InviteBanner place="calendar" />

      <section className="schedule-shell">
        <aside className="schedule-sidebar">
          <div className="membership-status">
            <p className="section-label">Weekly sessions</p>
            <strong>3 included</strong>
            <p>Membership includes three live sessions every Monday–Sunday.</p>
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
              {view === 'week' ? (
                <div className="week-range-control">
                  <button
                    type="button"
                    aria-label="Previous week"
                    disabled={weekOffset === -1}
                    onClick={() => {
                      setWeekOffset((current) => current - 1);
                      setExpanded(null);
                    }}
                  >
                    <span aria-hidden="true">←</span>
                  </button>
                  <p className="calendar-range">{weekLabels[weekOffset + 1]}</p>
                  <button
                    type="button"
                    aria-label="Next week"
                    disabled={weekOffset === 1}
                    onClick={() => {
                      setWeekOffset((current) => current + 1);
                      setExpanded(null);
                    }}
                  >
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              ) : (
                <p className="calendar-range">May 2026</p>
              )}
              <p className="timezone">Times shown in your local time · Central in booking details</p>
            </div>
            <div className="toolbar-actions">
              <label>
                <span className="sr-only">Filter sessions</span>
                <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                  <option>All sessions</option>
                  <option>Adults & teens</option>
                  <option>Families welcome</option>
                  <option>No preparation</option>
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

          {view === 'week' ? (
            <div className="session-list">
              {sessions.map((session, index) => (
                <article
                  className={`session-row ${expanded === index ? 'expanded' : ''}`}
                  key={`${session.date}-${session.title}`}
                >
                  <div className="session-date">
                    <span>{session.day}</span>
                    <strong>{Number(session.date) + weekOffset * 7}</strong>
                  </div>
                  <div className="session-time">{session.time}</div>
                  <div className="session-main">
                    <span className={`session-swatch tone-${session.tone}`} />
                    <div>
                      <h2>{session.title}</h2>
                      <p>{session.audience} · 60 min · 1 credit</p>
                    </div>
                  </div>
                  <div className={`seat-count ${session.seats.includes('left') ? 'limited' : ''}`}>{session.seats}</div>
                  <div className="session-actions">
                    <button
                      className="session-more"
                      type="button"
                      aria-expanded={expanded === index}
                      onClick={() => setExpanded(expanded === index ? null : index)}
                    >
                      {expanded === index ? 'Close' : 'Details'}
                    </button>
                    <Link href={`/book/${session.slug}`}>Book</Link>
                  </div>
                  {expanded === index && (
                    <div className="session-detail">
                      <p>
                        <strong>Bring this:</strong> {session.prep}
                      </p>
                      <p>Sign in or join to reserve a seat. Member names are shown only inside the room.</p>
                      <Link href={`/book/${session.slug}`}>
                        Open booking page <span aria-hidden="true">↗</span>
                      </Link>
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="month-view">
              <div className="weekday-row">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="month-grid">
                {monthDays.map((day, index) => (
                  <div className={`month-day ${day === 18 ? 'today' : ''}`} key={index}>
                    {day && <strong>{day}</strong>}
                    {day && eventDays[day] && (
                      <button
                        type="button"
                        onClick={() => setView('week')}
                        className={`day-events tone-${eventDays[day].tone}`}
                      >
                        {eventDays[day].count} {eventDays[day].count === 1 ? 'session' : 'sessions'}
                      </button>
                    )}
                  </div>
                ))}
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
