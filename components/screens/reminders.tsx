'use client';

// Reminders: turn on notifications for this device and send a test, so members can see what the
// 24-hour and 1-hour reminders look like. Tests are shown by this device's service worker (public/sw.js).
// Reminders for booked sessions need a push sender on the server, which comes with the reminders milestone.
// - iPhone and iPad show notifications only in the Home Screen app (iOS 16.4+), so Safari gets install steps.
// - Android and desktop browsers show them right away; installing is optional.
import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';
import InstallButton from '@/components/install-button';
import MenuToggle from '@/components/menu-toggle';

type Status = 'checking' | 'unsupported' | 'ios-install' | NotificationPermission;

const TESTS = {
  day: {
    label: 'Test the 24-hour reminder',
    title: 'Tomorrow: Quiet Co-Work at 10:00 am',
    body: 'Bring the task you want to finish. Tap to see your session.',
    url: '/sessions',
  },
  hour: {
    label: 'Test the 1-hour reminder',
    title: 'Quiet Co-Work starts in 1 hour',
    body: 'The room opens at 9:50 am. Tap to check your camera and mic.',
    url: '/camera-check',
  },
} as const;
type TestKind = keyof typeof TESTS;

const NOTE: Record<Status, { title: string; text: string }> = {
  checking: { title: 'Checking this device', text: 'One moment.' },
  unsupported: {
    title: 'This browser can’t show notifications',
    text: 'Open MeetDoConnect in Chrome, Edge, Firefox or Safari. Browsers inside other apps, like Facebook or Instagram, don’t support them. On iPhone, update to iOS 16.4 or later.',
  },
  'ios-install': {
    title: 'Add the app to your Home Screen first',
    text: 'iPhone and iPad show notifications only from the MeetDoConnect app on your Home Screen.',
  },
  default: { title: 'Reminders are off on this device', text: 'Turn them on below. Your browser asks once.' },
  granted: { title: 'Reminders are on for this device', text: 'Send a test to see how they look.' },
  denied: { title: 'Notifications are blocked', text: 'Allow them in your settings, then come back to this page.' },
};

// Permission only changes through the button below (or in settings, which needs a reload), so a local emitter is enough.
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isIOS() {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

function getStatus(): Status {
  const standalone =
    matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  if (isIOS() && !standalone) return 'ios-install';
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  return Notification.permission;
}

async function showTest(kind: TestKind) {
  const { title, body, url } = TESTS[kind];
  const options: NotificationOptions = {
    body,
    icon: '/icons/icon-192.png',
    tag: `reminder-test-${kind}`,
    data: { url },
  };
  const registration = await navigator.serviceWorker.getRegistration();
  if (registration) return registration.showNotification(title, options);
  // No service worker under `next dev`. Desktop browsers can still show one from the page; Android needs the worker.
  new Notification(title, options);
}

export default function RemindersPage() {
  const status = useSyncExternalStore(subscribe, getStatus, () => 'checking' as Status);
  const ios = useSyncExternalStore(subscribe, isIOS, () => false);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const note = NOTE[status];

  async function turnOn() {
    setAsking(true);
    try {
      await Notification.requestPermission();
    } finally {
      setAsking(false);
      emit();
    }
  }

  async function test(kind: TestKind) {
    setMessage(null);
    try {
      await showTest(kind);
      setMessage({ tone: 'ok', text: 'Sent. Look at the top of your screen or in your notifications.' });
    } catch {
      setMessage({ tone: 'error', text: 'This device didn’t show it. Check the tips below and try again.' });
    }
  }

  return (
    <main className="schedule-page">
      <header className="schedule-nav">
        <Link className="schedule-mark" href="/" aria-label="MeetDoConnect home">
          <span>Meet</span>
          <span>Do</span>
          <span>Connect</span>
        </Link>
        <nav aria-label="Reminders navigation">
          <Link href="/">Home</Link>
          <Link href="/calendar">Calendar</Link>
          <Link href="/#rooms">Rooms</Link>
          <Link href="/membership">Membership</Link>
        </nav>
        <Link className="schedule-signin" href="/calendar">
          Back to calendar
        </Link>
        <MenuToggle />
      </header>

      <section className="schedule-hero">
        <div>
          <p className="section-label">Reminders</p>
          <h1>
            Never miss
            <br />
            <span>your hour.</span>
          </h1>
        </div>
        <div className="public-note" role="status">
          <span className="note-dot" />
          <div>
            <strong>{note.title}</strong>
            <p>{note.text}</p>
          </div>
        </div>
      </section>

      <section className="reminders-shell">
        <div>
          <h2>When they arrive</h2>
          <div className="room-ready-list">
            <div>
              <span>01</span>
              <p>
                <strong>24 hours before</strong>What to bring, with a link to your session.
              </p>
            </div>
            <div>
              <span>02</span>
              <p>
                <strong>1 hour before</strong>Time to set up. The room opens 10 minutes before the start.
              </p>
            </div>
            <div>
              <span>03</span>
              <p>
                <strong>One tap</strong>Each reminder opens the session in MeetDoConnect.
              </p>
            </div>
          </div>
        </div>

        <div className="reminders-card">
          {status === 'ios-install' && (
            <>
              <h2>Three steps on iPhone</h2>
              <ol className="reminders-steps">
                <li>
                  <strong>Tap Share</strong> in Safari: the square with an arrow, at the bottom (top right on iPad).
                </li>
                <li>
                  <strong>Tap Add to Home Screen</strong>, then Add. Scroll the list if you don’t see it.
                </li>
                <li>
                  <strong>Open MeetDoConnect from your Home Screen</strong>, go to Calendar, tap Set up reminders and
                  turn them on.
                </li>
              </ol>
            </>
          )}

          {status === 'default' && (
            <>
              <h2>Turn on reminders</h2>
              <button className="enter-room" type="button" disabled={asking} onClick={turnOn}>
                {asking ? 'Waiting for your answer…' : 'Turn on reminders'} <span aria-hidden="true">→</span>
              </button>
              <p className="reminders-tip">Your browser asks once. Tap Allow.</p>
              <InstallButton />
            </>
          )}

          {status === 'granted' && (
            <>
              <h2>Send a test</h2>
              {(Object.keys(TESTS) as TestKind[]).map((kind, index) => (
                <button
                  key={kind}
                  className={`enter-room ${index ? 'reminders-secondary' : ''}`}
                  type="button"
                  onClick={() => test(kind)}
                >
                  {TESTS[kind].label} <span aria-hidden="true">→</span>
                </button>
              ))}
              {message && (
                <p className={`reminders-message ${message.tone}`} role="status">
                  {message.text}
                </p>
              )}
              <p className="reminders-tip">
                Nothing showed up? Turn off Do Not Disturb or Focus, and check that notifications are allowed for your
                browser in your phone or computer settings.
              </p>
            </>
          )}

          {status === 'denied' && (
            <>
              <h2>Allow notifications</h2>
              <p className="reminders-tip">
                {ios
                  ? 'Open Settings, then Notifications, then MeetDoConnect, and turn on Allow Notifications.'
                  : 'Tap the icon to the left of the web address, open Site settings (or Permissions), set Notifications to Allow, then reload this page. In the installed Android app: hold the MeetDoConnect icon, tap App info, then Notifications.'}
              </p>
            </>
          )}

          {(status === 'checking' || status === 'unsupported') && <p className="reminders-tip">{note.text}</p>}

          <p className="join-window-note">
            Tests come from this device. Reminders for the sessions you book are sent automatically once member
            reminders go live.
          </p>
        </div>
      </section>
    </main>
  );
}
