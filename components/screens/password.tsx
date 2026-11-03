'use client';

// Change password for a signed-in member or admin (/password). It is also where the reset-email link lands:
// that link signs the person in for a moment, and then no current password is needed.
import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import PasswordForm from '@/components/password-form';
import { useAccount } from '@/lib/account';
import { getSupabase } from '@/lib/supabase';

const noop = () => () => {};
// A reset link arrives with type=recovery in the address. Read it once when this page's code loads, before
// Supabase tidies the address bar.
const OPENED_BY_RESET_LINK = typeof window !== 'undefined' && window.location.hash.includes('type=recovery');

export default function PasswordPage() {
  const { ready, account } = useAccount();
  const viaLink = useSyncExternalStore(
    noop,
    () => OPENED_BY_RESET_LINK,
    () => false,
  );
  const [viaEvent, setViaEvent] = useState(false);
  const recovery = viaLink || viaEvent;

  // Supabase also announces the reset link as a PASSWORD_RECOVERY event.
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setViaEvent(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <main className="signup-page">
      <header className="signup-header">
        <Link className="schedule-mark" href="/" aria-label="MeetDoConnect home">
          <span>Meet</span>
          <span>Do</span>
          <span>Connect</span>
        </Link>
        <div style={{ flex: 1 }} />
        <Link href="/calendar">Back to my sessions</Link>
      </header>

      <div className="signup-shell">
        <aside className="signup-aside">
          <p className="section-label">Your account</p>
          <h1>
            A new password,
            <br />
            in a minute.
          </h1>
          <p>Pick something only you know. We sign you out on your other devices once it is saved.</p>
        </aside>

        <section className="signup-card">
          <div className="signup-step">
            <p className="step-count">{recovery ? 'Reset your password' : 'Change password'}</p>
            <h2>{recovery ? 'Choose a new password' : 'Change your password'}</h2>
            {!ready ? (
              <p className="step-intro">Loading…</p>
            ) : account ? (
              <>
                <p className="step-intro">
                  {recovery
                    ? `You are signed in as ${account.email} through your reset link.`
                    : `Signed in as ${account.email}. Enter your current password to confirm it is you.`}
                </p>
                <PasswordForm variant="member" email={account.email} recovery={recovery} />
              </>
            ) : recovery ? (
              <p className="step-intro">Opening your reset link…</p>
            ) : (
              <p className="step-intro">
                <Link href="/signin?next=/password">Sign in</Link> first to change your password. Forgot it? Use “Forgot
                password?” on the sign-in page and we email you a link.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
