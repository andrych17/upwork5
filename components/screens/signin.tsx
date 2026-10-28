'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getSupabase, setDemoUser } from '@/lib/supabase';

export default function SigninPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    if (!email || !password) {
      setErrorMsg('Please enter both your email and password.');
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabase();
      if (supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          setErrorMsg(error.message);
          setLoading(false);
          return;
        }
        if (data.user) {
          setDemoUser({
            id: data.user.id,
            email: data.user.email ?? email,
            first_name: data.user.user_metadata?.first_name ?? 'Member',
            last_name: data.user.user_metadata?.last_name ?? '',
            monthly_credits: 13,
            payment_status: 'active',
          });
          router.push('/calendar');
          return;
        }
      } else {
        // Local preview fallback without live Supabase env
        setDemoUser({
          id: 'demo-user-1',
          email,
          first_name: email.split('@')[0] || 'Member',
          last_name: '',
          monthly_credits: 13,
          payment_status: 'active',
        });
        router.push('/calendar');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred during sign in.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    if (!email) {
      setErrorMsg('Please enter your email address to receive reset instructions.');
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabase();
      if (supabase) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/signin`,
        });
        if (error) {
          setErrorMsg(error.message);
        } else {
          setInfoMsg('Check your email for the password reset link.');
        }
      } else {
        setInfoMsg('Reset instructions sent (preview mode). Check your inbox.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not send reset email.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="signup-page">
      <header className="signup-header">
        <Link className="schedule-mark" href="/" aria-label="MeetDoConnect home">
          <span>Meet</span>
          <span>Do</span>
          <span>Connect</span>
        </Link>
        <div style={{ flex: 1 }} />
        <Link href="/signup">Need an account? Join</Link>
      </header>

      <div className="signup-shell">
        <aside className="signup-aside">
          <p className="section-label">Welcome back</p>
          <h1>
            Good evenings
            <br />
            start here.
          </h1>
          <p>
            Sign in to see your upcoming bookings, join your live video rooms, or choose your next session.
          </p>
          <div className="signup-trust">
            <span>13 sessions monthly</span>
            <span>Private by design</span>
            <span>Up to 4 sessions per week</span>
          </div>
        </aside>

        <section className="signup-card">
          {mode === 'signin' ? (
            <div className="signup-step">
              <p className="step-count">Member Sign in</p>
              <h2>Sign in to your account</h2>
              <p className="step-intro">
                Enter your email address and password to access your sessions and bookings.
              </p>

              {errorMsg && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#991b1b',
                    fontSize: '14px',
                    marginBottom: '16px',
                  }}
                >
                  {errorMsg}
                </div>
              )}

              {infoMsg && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    backgroundColor: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    color: '#065f46',
                    fontSize: '14px',
                    marginBottom: '16px',
                  }}
                >
                  {infoMsg}
                </div>
              )}

              <form onSubmit={handleSignIn}>
                <div className="form-grid">
                  <label className="full-field">
                    <span>Email</span>
                    <input
                      type="email"
                      required
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </label>
                  <label className="full-field">
                    <span>Password</span>
                    <input
                      type="password"
                      required
                      placeholder="Your account password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '16px',
                    fontSize: '14px',
                  }}
                >
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" defaultChecked />
                    <span>Remember me</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setErrorMsg('');
                      setInfoMsg('');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'var(--amber-700, #b45309)',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      fontSize: '14px',
                    }}
                  >
                    Forgot password?
                  </button>
                </div>

                <div style={{ marginTop: '28px' }}>
                  <button
                    className="signup-next"
                    type="submit"
                    disabled={loading}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    {loading ? 'Signing in...' : 'Sign in'} <span aria-hidden="true">→</span>
                  </button>
                </div>
              </form>

              <div
                style={{
                  marginTop: '24px',
                  paddingTop: '20px',
                  borderTop: '1px solid var(--border-color, #e5e7eb)',
                  textAlign: 'center',
                  fontSize: '14px',
                }}
              >
                <span>Don’t have a membership yet? </span>
                <Link href="/signup" style={{ color: 'var(--amber-700, #b45309)', fontWeight: 600 }}>
                  Join MeetDoConnect
                </Link>
              </div>
            </div>
          ) : (
            <div className="signup-step">
              <p className="step-count">Account Help</p>
              <h2>Reset your password</h2>
              <p className="step-intro">
                Enter your email and we’ll send a link to securely choose a new password.
              </p>

              {errorMsg && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#991b1b',
                    fontSize: '14px',
                    marginBottom: '16px',
                  }}
                >
                  {errorMsg}
                </div>
              )}

              {infoMsg && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    backgroundColor: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    color: '#065f46',
                    fontSize: '14px',
                    marginBottom: '16px',
                  }}
                >
                  {infoMsg}
                </div>
              )}

              <form onSubmit={handleForgotPassword}>
                <div className="form-grid">
                  <label className="full-field">
                    <span>Email</span>
                    <input
                      type="email"
                      required
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </label>
                </div>

                <div style={{ marginTop: '28px', display: 'flex', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signin');
                      setErrorMsg('');
                      setInfoMsg('');
                    }}
                    style={{
                      padding: '12px 20px',
                      borderRadius: '8px',
                      border: '1px solid #d1d5db',
                      background: 'white',
                      cursor: 'pointer',
                    }}
                  >
                    Back to sign in
                  </button>
                  <button
                    className="signup-next"
                    type="submit"
                    disabled={loading}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    {loading ? 'Sending...' : 'Send reset link'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
