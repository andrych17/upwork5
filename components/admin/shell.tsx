'use client';

// Admin frame for every /admin page: sign-in gate, left sidebar, and the signed-in admin for the pages.
// The gate is a convenience only. The database checks is_admin() again on every admin read and write.
import type { Route } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { fullName } from '@/lib/admin';
import { getSupabase } from '@/lib/supabase';

interface AdminCtx {
  supabase: SupabaseClient;
  me: { id: string; name: string; email: string };
  /** Pending Hello Videos, shown on the sidebar. Pages call refreshCounts() after a review. */
  refreshCounts: () => void;
}

const Ctx = createContext<AdminCtx | null>(null);

export function useAdmin(): AdminCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAdmin must be used inside AdminShell');
  return ctx;
}

const icon = (d: string) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);

const NAV: { title: string; items: { href: Route; label: string; d: string; count?: 'hello' | 'reports' }[] }[] = [
  {
    title: 'Overview',
    items: [{ href: '/admin', label: 'Dashboard', d: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z' }],
  },
  {
    title: 'Members',
    items: [
      {
        href: '/admin/members',
        label: 'Members',
        d: 'M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M21 19v-1a3 3 0 0 0-3-3M18 5a3 3 0 0 1 0 6',
      },
      { href: '/admin/hello-videos', label: 'Hello Videos', d: 'M4 7h11v10H4zM15 10l5-3v10l-5-3', count: 'hello' },
      { href: '/admin/payments', label: 'Payments', d: 'M3 6h18v12H3zM3 10h18M7 15h3' },
      { href: '/admin/reports', label: 'Reports', d: 'M5 21V4h11l-1 4 4 1v8H9l1 4z', count: 'reports' },
    ],
  },
  {
    title: 'Rooms',
    items: [
      { href: '/admin/sessions', label: 'Sessions', d: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4' },
      { href: '/admin/bookings', label: 'Bookings', d: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3' },
    ],
  },
  {
    title: 'System',
    items: [
      {
        href: '/admin/settings',
        label: 'Settings',
        d: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.07-.4.1-.8.1-1.2',
      },
      { href: '/admin/usage', label: 'Usage', d: 'M5 20V11M12 20V4M19 20v-6' },
      { href: '/admin/logs', label: 'Activity log', d: 'M12 7v5l3 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9' },
    ],
  },
];

type Gate = 'loading' | 'signed-out' | 'not-admin' | 'no-db' | 'ok';

async function resolveGate(supabase: SupabaseClient): Promise<{ gate: Gate; me: AdminCtx['me'] | null }> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { gate: 'signed-out', me: null };
  const { data: prof } = await supabase
    .from('profiles')
    .select('id,email,first_name,last_name,is_admin')
    .eq('id', data.user.id)
    .maybeSingle();
  if (!prof?.is_admin) return { gate: 'not-admin', me: null };
  return { gate: 'ok', me: { id: prof.id, name: fullName(prof), email: prof.email ?? data.user.email ?? '' } };
}

/** Pending Hello Videos and open room reports, for the sidebar. */
async function countPending(supabase: SupabaseClient): Promise<{ hello: number; reports: number }> {
  const [hello, reports] = await Promise.all([
    supabase.from('hello_videos').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('room_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ]);
  return { hello: hello.count ?? 0, reports: reports.count ?? 0 };
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const supabase = getSupabase();
  const pathname = usePathname().replace(/\/$/, '') || '/admin';
  const [gate, setGate] = useState<Gate>(supabase ? 'loading' : 'no-db');
  const [me, setMe] = useState<AdminCtx['me'] | null>(null);
  const [counts, setCounts] = useState({ hello: 0, reports: 0 });
  const [navOpen, setNavOpen] = useState(false);

  const apply = useCallback((r: { gate: Gate; me: AdminCtx['me'] | null }) => {
    setMe(r.me);
    setGate(r.gate);
  }, []);
  const checkUser = useCallback(async () => {
    if (supabase) apply(await resolveGate(supabase));
  }, [supabase, apply]);
  const refreshCounts = useCallback(() => {
    if (supabase) void countPending(supabase).then(setCounts);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    let live = true;
    void resolveGate(supabase).then((r) => live && apply(r));
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setGate('signed-out');
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, [supabase, apply]);

  useEffect(() => {
    if (gate !== 'ok' || !supabase) return;
    let live = true;
    void countPending(supabase).then((n) => live && setCounts(n));
    return () => {
      live = false;
    };
  }, [gate, supabase]);

  if (gate !== 'ok' || !supabase || !me) {
    return (
      <div className="adm">
        <SignInGate gate={gate} supabase={supabase} onSignedIn={checkUser} />
      </div>
    );
  }

  const signOut = async () => {
    await supabase.auth.signOut();
    setGate('signed-out');
  };

  return (
    <Ctx.Provider value={{ supabase, me, refreshCounts }}>
      <div className="adm" data-nav-open={navOpen ? '' : undefined}>
        <div className="adm-layout">
          <aside className="adm-side" id="adm-nav">
            <Link className="adm-brand" href="/admin">
              MeetDoConnect <small>Admin</small>
            </Link>
            <nav className="adm-nav" aria-label="Admin">
              {NAV.map((group) => (
                <div key={group.title}>
                  <h2>{group.title}</h2>
                  {group.items.map((item) => {
                    const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => setNavOpen(false)}
                      >
                        {icon(item.d)}
                        {item.label}
                        {item.count && counts[item.count] > 0 && (
                          <span className="adm-count">{counts[item.count]}</span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
            <div className="adm-me">
              <div>
                <strong>{me.name}</strong>
                <span>{me.email}</span>
              </div>
              <div className="adm-me-actions">
                <Link className="adm-btn adm-btn-sm" href="/calendar">
                  Member site
                </Link>
                <button type="button" className="adm-btn adm-btn-sm adm-btn-danger" onClick={signOut}>
                  Sign out
                </button>
              </div>
            </div>
          </aside>
          {navOpen && <div className="adm-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}
          <div>
            <div className="adm-topbar">
              <button
                type="button"
                className="adm-menu-btn"
                aria-expanded={navOpen}
                aria-controls="adm-nav"
                aria-label="Open admin menu"
                onClick={() => setNavOpen((open) => !open)}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              <strong>
                MeetDoConnect <small>Admin</small>
              </strong>
              <Link className="adm-btn adm-btn-sm" href="/calendar">
                Member site
              </Link>
            </div>
            <main className="adm-main">{children}</main>
          </div>
        </div>
      </div>
    </Ctx.Provider>
  );
}

function SignInGate({
  gate,
  supabase,
  onSignedIn,
}: {
  gate: Gate;
  supabase: SupabaseClient | null;
  onSignedIn: () => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (gate === 'loading') {
    return (
      <div className="adm-gate">
        <p>Checking your sign-in…</p>
      </div>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setBusy(false);
      return;
    }
    await onSignedIn();
    setBusy(false);
  };

  const signOut = async () => {
    await supabase?.auth.signOut();
    window.location.reload();
  };

  return (
    <div className="adm-gate">
      <div className="adm-gate-card">
        <span className="adm-badge adm-badge-accent">Admin</span>
        <h1>MeetDoConnect admin</h1>
        {gate === 'no-db' ? (
          <p>This build is not connected to the database, so there is nothing to manage here.</p>
        ) : gate === 'not-admin' ? (
          <>
            <p>This account is signed in but does not have admin access.</p>
            <button type="button" className="adm-btn" onClick={signOut}>
              Sign in with another account
            </button>
          </>
        ) : (
          <>
            <p>Sign in with an admin account.</p>
            {error && <p className="adm-msg adm-msg-error">{error}</p>}
            <form className="adm-form" onSubmit={submit}>
              <label className="adm-field">
                <span>Email</span>
                <input
                  className="adm-input"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="adm-field">
                <span>Password</span>
                <input
                  className="adm-input"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </>
        )}
        <p style={{ margin: '1.25rem 0 0' }}>
          <Link href="/">Back to MeetDoConnect</Link>
        </p>
      </div>
    </div>
  );
}
