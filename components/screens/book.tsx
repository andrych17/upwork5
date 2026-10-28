'use client';

import Link from 'next/link';
import { useState } from 'react';
import { getSession } from '@/lib/session-data';
import { updateBuddyDemo, useBuddyDemo } from '@/lib/buddy-demo';
import InviteBanner from '@/components/invite-banner';
import MenuToggle from '@/components/menu-toggle';

function threeHoursBefore(time: string) {
  const match = time.match(/(\d+):(\d+)\s(am|pm)/);
  if (!match) return time;
  let hour = Number(match[1]) % 12;
  if (match[3] === 'pm') hour += 12;
  hour = (hour - 3 + 24) % 24;
  const suffix = hour >= 12 ? 'pm' : 'am';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${match[2]} ${suffix}`;
}

export default function BookPage({ slug }: { slug: string }) {
  const [cameraOff, setCameraOff] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [invited, setInvited] = useState<string | null>(null);
  const { inviting } = useBuddyDemo();
  const session = getSession(slug);

  const confirm = () => {
    if (inviting) {
      updateBuddyDemo((demo) => ({
        ...demo,
        inviting: null,
        sessionInvites: { ...demo.sessionInvites, [inviting]: session.slug },
      }));
      setInvited(inviting);
    }
    setConfirmed(true);
  };

  if (confirmed) {
    return (
      <main className="booking-page">
        <header className="schedule-nav">
          <Link className="schedule-mark" href="/" aria-label="MeetDoConnect home">
            <span>Meet</span>
            <span>Do</span>
            <span>Connect</span>
          </Link>
          <nav aria-label="Booking navigation">
            <Link href="/">Home</Link>
            <Link href="/calendar">Calendar</Link>
            <Link href="/#rooms">Rooms</Link>
            <Link href="/membership">Membership</Link>
          </nav>
          <Link className="schedule-signin" href="/membership">
            My account
          </Link>
          <MenuToggle />
        </header>

        <section className="confirmation-screen" aria-live="polite">
          <div className="confirmation-mark" aria-hidden="true">
            ✓
          </div>
          <p className="section-label">Your seat is saved</p>
          <h1>
            See you at
            <br />
            {session.title}.
          </h1>
          <div className="confirmation-summary">
            <div>
              <span>When</span>
              <strong>
                {session.day}, {session.month} {session.date} · {session.time}
              </strong>
            </div>
            <div>
              <span>Camera</span>
              <strong>{cameraOff ? 'Off · Bad Hair Day card used' : 'On · faces make this work'}</strong>
            </div>
            <div>
              <span>Room opens</span>
              <strong>9:50 am</strong>
            </div>
          </div>
          <p className="confirmation-note">
            We’ll send your prep card now, a reminder 24 hours before, and a Join link one hour before.
            {invited && ` ${invited} gets the invitation in your Buddy Room and confirms with their own credit.`}
          </p>
          <div className="confirmation-actions">
            {invited && (
              <Link
                className="primary-booking-action"
                href="/after-session"
                onClick={() => updateBuddyDemo((demo) => ({ ...demo, chat: invited }))}
              >
                Back to chat with {invited}
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
      <header className="schedule-nav">
        <Link className="schedule-mark" href="/" aria-label="MeetDoConnect home">
          <span>Meet</span>
          <span>Do</span>
          <span>Connect</span>
        </Link>
        <nav aria-label="Booking navigation">
          <Link href="/">Home</Link>
          <Link className="active" href="/calendar">
            Calendar
          </Link>
          <Link href="/#rooms">Rooms</Link>
          <Link href="/membership">Membership</Link>
        </nav>
        <Link className="schedule-signin" href="/signup">
          Sign in
        </Link>
        <MenuToggle />
      </header>

      <div className="booking-back">
        <Link href="/calendar">
          <span aria-hidden="true">←</span> Back to the calendar
        </Link>
      </div>

      <section className="booking-layout">
        <div className="booking-main">
          <div className="booking-title">
            <div className="booking-date-block">
              <span>{session.day}</span>
              <strong>{session.date}</strong>
              <span>{session.month}</span>
            </div>
            <div>
              <p className="section-label">Live session · 60 minutes</p>
              <h1>{session.title}</h1>
            </div>
          </div>

          <div className="booking-intro">
            <p>
              {session.description ??
                'Everything you need to arrive prepared and enjoy this session is collected below. Come as you are; the activity gives everyone an easy place to begin.'}
            </p>
            <div className="booking-tags">
              <span>{session.forWhom}</span>
              <span>7 attending</span>
            </div>
          </div>

          <div className="prep-panel">
            <div className="prep-panel-heading">
              <p className="section-label">Your prep card</p>
              <span>Review before your session</span>
            </div>
            <h2>What to bring</h2>
            <p className="full-prep-copy">{session.prep}</p>
            <div className="full-prep-details">
              {session.ideas && (
                <>
                  <p className="detail-label">Ideas & prompts</p>
                  <div className="idea-list">
                    {session.ideas.map((idea) => (
                      <span key={idea}>{idea}</span>
                    ))}
                  </div>
                </>
              )}
              {session.note && (
                <p className="booking-safety-note">
                  <strong>Please note:</strong> {session.note}
                </p>
              )}
            </div>
          </div>

          <div className="run-panel">
            <p className="section-label">How the hour flows</p>
            <p className="full-run-copy">{session.run}</p>
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
            <p className="section-label">Confirm your seat</p>
            <div className="checkout-time">
              <strong>
                {session.day}, {session.month} {session.date}
              </strong>
              <span>{session.time} local time</span>
              <span>Central time appears in your confirmation</span>
            </div>
            <div className="credit-cost">
              <span>Booking cost</span>
              <strong>1 credit</strong>
            </div>
            <div className="credit-balance">
              <div>
                <span>Your week</span>
                <strong>3 of 3 credits left</strong>
              </div>
              <div className="credit-pips" aria-label="Three of three weekly credits remaining">
                <span />
                <span />
                <span />
              </div>
            </div>

            <label className="camera-choice">
              <input type="checkbox" checked={cameraOff} onChange={(event) => setCameraOff(event.target.checked)} />
              <span className="choice-control" aria-hidden="true" />
              <span>
                <strong>Use a Bad Hair Day card</strong>
                Join with your camera off. You have 2 of 3 left this month.
              </span>
            </label>

            <div className="camera-result">
              <span className={cameraOff ? 'camera-off' : 'camera-on'} />
              <div>
                <strong>{cameraOff ? 'Camera off' : 'Camera on'}</strong>
                <p>
                  {cameraOff ? 'Your profile photo appears in the room.' : 'Faces make this work. See you in a moment.'}
                </p>
              </div>
            </div>

            <button className="confirm-booking" type="button" onClick={confirm}>
              {inviting ? `Confirm & invite ${inviting}` : 'Confirm with 1 credit'} <span aria-hidden="true">→</span>
            </button>
            <p className="cancel-copy">
              Free cancellation until {session.day} at {threeHoursBefore(session.time)}—three hours before the session
              starts. After that, you can release the seat but the credit is used.
            </p>
          </div>
          <div className="booking-help">
            <strong>Booking closes at 9:45 am.</strong>
            <p>The room opens at 9:50 am and closes ten minutes after the start.</p>
          </div>
        </aside>
      </section>
    </main>
  );
}
