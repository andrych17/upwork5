'use client';

import Link from 'next/link';
import { useState } from 'react';
import MenuToggle from '@/components/menu-toggle';

const membershipStates = {
  active: {
    title: 'Active · paid through Nov 22',
    copy: 'Book, cancel, and buy extras as usual.',
    action: 'View sessions',
    tone: 'success',
  },
  due: {
    title: 'Payment due',
    copy: 'Renew to keep booking. Existing sessions stay visible.',
    action: 'Pay now',
    tone: 'warning',
  },
  failed: {
    title: 'Payment did not go through',
    copy: 'Update your card by Friday to keep your sessions. New booking is paused.',
    action: 'Update card',
    tone: 'danger',
  },
  ending: {
    title: 'Ending Nov 22',
    copy: 'You can book through your paid-through date and restart any time.',
    action: 'Restart membership',
    tone: 'info',
  },
  paused: {
    title: 'Membership paused',
    copy: 'Renew to book. Future sessions were cancelled and extra credits returned.',
    action: 'Renew membership',
    tone: 'warning',
  },
  none: {
    title: 'No membership',
    copy: 'Browse freely. Start a membership whenever you are ready to book.',
    action: 'See plans',
    tone: 'neutral',
  },
};

const bookingMessages = [
  ['No weekly credits', 'You have used your 3 sessions for this week. Use an extra session or buy another.'],
  ['No Bad Hair Day cards', 'You have used all 3 cards this month. That’s OK. We like you just the way you are.'],
  [
    'Cancellation closed',
    'Free cancellation closed three hours before the start. You may release the seat, but the credit is used.',
  ],
  ['Card change closed', 'Bad Hair Day cards can be added or removed until three hours before the start.'],
  ['Overlap', 'This overlaps another session you booked.'],
  ['Full', 'This session is full.'],
  ['Booking closed', 'Booking closed 15 minutes before the start.'],
  ['Too far ahead', 'You can book up to 14 days ahead.'],
  ['Payment failed', 'Your last payment did not go through. Update your card to book again.'],
  ['Beyond paid period', 'Your membership is paid through Nov 8. This session opens after your next renewal.'],
];

export default function P1StatesPage() {
  const [membership, setMembership] = useState<keyof typeof membershipStates>('active');
  const [surface, setSurface] = useState<'empty' | 'loading' | 'error' | 'offline'>('empty');
  const state = membershipStates[membership];

  return (
    <main className="states-page" id="main-content">
      <header className="schedule-nav">
        <Link className="schedule-mark" href="/">
          <span>Meet</span>
          <span>Do</span>
          <span>Connect</span>
        </Link>
        <nav aria-label="State preview navigation">
          <Link href="/calendar">Calendar</Link>
          <Link href="/sessions">My sessions</Link>
          <Link href="/membership">Membership</Link>
        </nav>
        <Link className="schedule-signin" href="/">
          Exit preview
        </Link>
        <MenuToggle />
      </header>

      <section className="states-hero">
        <p className="section-label">P1 states & accessibility</p>
        <h1>
          Every state has
          <br />
          <span>a clear next step.</span>
        </h1>
        <p>
          This handoff page documents the production states required by the Design Brief. Controls are keyboard
          reachable and alerts use plain language.
        </p>
      </section>

      <section className="state-section">
        <div className="state-heading">
          <p className="section-label">Membership</p>
          <h2>Payment-driven access</h2>
        </div>
        <div className="state-tabs" role="tablist" aria-label="Membership state">
          {Object.keys(membershipStates).map((key) => (
            <button
              role="tab"
              aria-selected={membership === key}
              className={membership === key ? 'selected' : ''}
              type="button"
              key={key}
              onClick={() => setMembership(key as keyof typeof membershipStates)}
            >
              {key}
            </button>
          ))}
        </div>
        <div className={`state-banner state-${state.tone}`} role="status" aria-live="polite">
          <span className="state-symbol" aria-hidden="true">
            !
          </span>
          <div>
            <strong>{state.title}</strong>
            <p>{state.copy}</p>
          </div>
          <button type="button">{state.action}</button>
        </div>
      </section>

      <section className="state-section">
        <div className="state-heading">
          <p className="section-label">Booking rules</p>
          <h2>Inline messages</h2>
        </div>
        <div className="message-grid">
          {bookingMessages.map(([title, copy], index) => (
            <article className={index === 2 || index === 7 ? 'message-warning' : ''} key={title}>
              <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <strong>{title}</strong>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="state-section">
        <div className="state-heading">
          <p className="section-label">Reusable surfaces</p>
          <h2>Empty, loading, error, offline</h2>
        </div>
        <div className="state-tabs" role="tablist" aria-label="Surface state">
          {(['empty', 'loading', 'error', 'offline'] as const).map((key) => (
            <button
              role="tab"
              aria-selected={surface === key}
              className={surface === key ? 'selected' : ''}
              type="button"
              key={key}
              onClick={() => setSurface(key)}
            >
              {key}
            </button>
          ))}
        </div>
        <div className="surface-state" aria-live="polite" aria-busy={surface === 'loading'}>
          {surface === 'empty' && (
            <>
              <span className="surface-mark">0</span>
              <h3>No sessions here yet.</h3>
              <p>Try another week or clear your filters.</p>
              <button type="button">Clear filters</button>
            </>
          )}
          {surface === 'loading' && (
            <>
              <span className="loading-ring" />
              <h3>Finding good evenings…</h3>
              <p>Your calendar will be ready in a moment.</p>
            </>
          )}
          {surface === 'error' && (
            <>
              <span className="surface-mark">!</span>
              <h3>That did not load.</h3>
              <p>Your information is safe. Try again when you are ready.</p>
              <button type="button">Try again</button>
            </>
          )}
          {surface === 'offline' && (
            <>
              <span className="surface-mark">↯</span>
              <h3>You’re offline.</h3>
              <p>Previously saved Prep Cards remain available. Booking returns with your connection.</p>
              <button type="button">Check connection</button>
            </>
          )}
        </div>
      </section>

      <section className="state-section">
        <div className="state-heading">
          <p className="section-label">Room access</p>
          <h2>Waiting, open, locked, closed</h2>
        </div>
        <div className="room-state-grid">
          <article>
            <span>Waiting</span>
            <strong>Room opens at 6:50 pm</strong>
            <p>Come back ten minutes before the start.</p>
            <button disabled type="button">
              Join room
            </button>
          </article>
          <article className="room-open">
            <span>Open</span>
            <strong>Your room is ready</strong>
            <p>Camera check comes next.</p>
            <button type="button">Join room</button>
          </article>
          <article>
            <span>Locked</span>
            <strong>The room locked at 7:10 pm</strong>
            <p>Late entry closes ten minutes after the start to protect the group.</p>
            <button disabled type="button">
              Room locked
            </button>
          </article>
          <article>
            <span>Closed</span>
            <strong>This session has ended</strong>
            <p>After-session activity-buddy picks stay open for 24 hours.</p>
            <button type="button">Open private picks</button>
          </article>
        </div>
      </section>

      <section className="state-section">
        <div className="state-heading">
          <p className="section-label">Onboarding</p>
          <h2>Validation and review</h2>
        </div>
        <div className="onboarding-state-grid">
          <article>
            <span className="field-example">
              Email <b aria-hidden="true">*</b>
            </span>
            <div className="fake-input error">not-an-email</div>
            <p role="alert">Enter an email in the format name@example.com.</p>
          </article>
          <article>
            <span className="field-example">Payment</span>
            <div className="mini-alert">
              Your payment did not go through. Check the card details or try another card.
            </div>
            <button type="button">Return to payment</button>
          </article>
          <article>
            <span className="field-example">Hello Video</span>
            <div className="review-pending">Under review</div>
            <p>
              Your video is private and visible only to an administrator. We’ll email you when your account is ready.
            </p>
          </article>
        </div>
      </section>

      <section className="a11y-checklist">
        <p className="section-label">Accessibility handoff</p>
        <h2>Built for keyboard, touch, motion, and contrast.</h2>
        <div>
          <span>Visible focus on every interactive control</span>
          <span>44px minimum primary tap targets</span>
          <span>Text labels accompany status colors</span>
          <span>Reduced-motion preference respected</span>
          <span>Live regions for confirmations and errors</span>
          <span>Semantic labels for forms and toggles</span>
          <span>High-contrast and forced-colors support</span>
          <span>Responsive at 375px without horizontal scrolling</span>
        </div>
        <Link className="p2-next-link" href="/p2">
          Open P2 workspace <span aria-hidden="true">→</span>
        </Link>
      </section>
    </main>
  );
}
