'use client';

// Hello Video (/hello-video): the review status plus the recorder (components/hello-recorder.tsx).
// Kelly 31 Oct: nobody joins a room before an admin approved their video. Sign-up records it in step 4;
// this page is for recording again or later.
import AccountMenu from '@/components/account-menu';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import HelloRecorder from '@/components/hello-recorder';
import MenuToggle from '@/components/menu-toggle';
import { getSupabase, type MembershipSummary } from '@/lib/supabase';

type HelloStatus = MembershipSummary['hello_status'];
interface Account {
  signedIn: boolean;
  status: HelloStatus;
  required: boolean;
  hold: boolean;
  reason: string | null;
}

const NOTE: Record<HelloStatus, { title: string; text: (a: Account) => string }> = {
  none: {
    title: 'No Hello Video yet',
    text: (a) =>
      a.required
        ? a.hold
          ? 'You can book now. Your bookings are held until it’s approved.'
          : 'You can book sessions once it’s approved.'
        : 'Record one whenever you’re ready.',
  },
  pending: {
    title: 'Waiting for review',
    text: (a) =>
      a.hold
        ? 'Your bookings are held until it’s approved. You’ll see the result here and on Membership.'
        : 'You’ll see the result here and on Membership. Recording again replaces it.',
  },
  declined: {
    title: 'We couldn’t approve this video',
    text: () => 'Your held bookings were released and the credits are back. Please contact us.',
  },
  approved: { title: 'You’re approved', text: () => 'Thanks for saying hi. Your video was deleted after the review.' },
  rejected: {
    title: 'Please record again',
    text: (a) =>
      a.reason ? `Note from the team: ${a.reason}` : 'Your last video wasn’t approved. Give it another go.',
  },
};

async function loadAccount(): Promise<Account> {
  const supabase = getSupabase();
  if (!supabase) return { signedIn: true, status: 'none', required: false, hold: false, reason: null };
  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session) return { signedIn: false, status: 'none', required: false, hold: false, reason: null };
  const [{ data: summary }, { data: last }] = await Promise.all([
    supabase.rpc('get_my_membership'),
    supabase
      .from('hello_videos')
      .select('status, reject_reason')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const m = summary as MembershipSummary | null;
  const status = m?.hello_status ?? 'none';
  return {
    signedIn: true,
    status,
    required: Boolean(m?.hello_required),
    hold: Boolean(m?.hello_hold),
    reason: status === 'rejected' && last?.status === 'rejected' ? (last.reject_reason as string | null) : null,
  };
}

export default function HelloVideoPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let current = true;
    loadAccount().then((next) => current && setAccount(next));
    return () => {
      current = false;
    };
  }, []);

  const status = account?.status ?? 'none';
  const note = account
    ? { title: NOTE[status].title, text: NOTE[status].text(account) }
    : { title: 'Checking your account', text: 'One moment.' };
  const canRecord = account?.signedIn && status !== 'approved' && status !== 'declined';

  return (
    <main className="schedule-page">
      <header className="schedule-nav">
        <Link className="schedule-mark" href="/" aria-label="MeetDoConnect home">
          <span>Meet</span>
          <span>Do</span>
          <span>Connect</span>
        </Link>
        <nav aria-label="Hello Video navigation">
          <Link href="/calendar">Calendar</Link>
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

      <section className="schedule-hero">
        <div>
          <p className="section-label">Hello Video</p>
          <h1>
            Say hi
            <br />
            <span>in two minutes.</span>
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
          <h2>What to say</h2>
          <div className="room-ready-list">
            <div>
              <span>01</span>
              <p>
                <strong>Your first name</strong>And where you’ll be joining from.
              </p>
            </div>
            <div>
              <span>02</span>
              <p>
                <strong>Why you joined</strong>What you’d like to get from the rooms.
              </p>
            </div>
            <div>
              <span>03</span>
              <p>
                <strong>Who watches it</strong>Only the MeetDoConnect team. It’s deleted as soon as it’s reviewed.
              </p>
            </div>
          </div>
        </div>

        <div className="reminders-card hello-card">
          {account && !account.signedIn && (
            <>
              <h2>Sign in first</h2>
              <Link className="enter-room" href="/signin">
                Sign in <span aria-hidden="true">→</span>
              </Link>
            </>
          )}

          {status === 'approved' && !sent && (
            <>
              <h2>All set</h2>
              <Link className="enter-room" href="/calendar">
                Find a session <span aria-hidden="true">→</span>
              </Link>
            </>
          )}

          {canRecord && !sent && (
            <HelloRecorder
              title={status === 'pending' ? 'Record a new one' : 'Record your Hello Video'}
              onSent={() => {
                setSent(true);
                setAccount((a) => (a ? { ...a, status: 'pending', reason: null } : a));
              }}
            />
          )}

          {sent && (
            <>
              <h2>Sent, thank you</h2>
              <p className="reminders-tip">
                The team will watch it soon. You’ll see the result here and on Membership.
              </p>
              <Link className="enter-room" href="/calendar">
                Find a session <span aria-hidden="true">→</span>
              </Link>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
