'use client';

// Right side of every page header. Signed out: the page's own link (Sign in / Join). Signed in: an
// initials button that opens the member menu, with Admin for admins and Install the app when the browser
// can install it. It sits beside the mobile menu button, so on a phone every member page is one tap away.
// Styles in app/account.css.
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { canInstall, startInstall, useInstallMode } from '@/components/install-button';
import { useAccount } from '@/lib/account';
import { getSupabase, setDemoUser } from '@/lib/supabase';

const LINKS: { href: Route; label: string }[] = [
  { href: '/calendar', label: 'Calendar' },
  { href: '/sessions', label: 'My sessions' },
  { href: '/after-session', label: 'Buddy Rooms' },
  { href: '/membership', label: 'Membership & credits' },
  { href: '/reminders', label: 'Reminders' },
  { href: '/hello-video', label: 'Hello Video' },
  { href: '/password', label: 'Change password' },
];

interface AccountMenuProps {
  /** Shown when nobody is signed in, e.g. the page's Sign in link. */
  signedOut: ReactNode;
  /** 'dark' on the photo header of the home page. */
  tone?: 'light' | 'dark';
}

export default function AccountMenu({ signedOut, tone = 'light' }: AccountMenuProps) {
  const { ready, account } = useAccount();
  const router = useRouter();
  const pathname = usePathname().replace(/\/$/, '') || '/';
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const installMode = useInstallMode();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [open]);

  if (!account) {
    // Hidden (not removed) while checking, so the header doesn't jump.
    return <div className={ready ? 'account-out' : 'account-out account-wait'}>{signedOut}</div>;
  }

  const signOut = async () => {
    setOpen(false);
    await getSupabase()?.auth.signOut();
    setDemoUser(null);
    router.push('/');
  };

  return (
    <div className="account" ref={ref} data-open={open ? '' : undefined} data-tone={tone}>
      <button
        type="button"
        className="account-avatar"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${account.name}`}
        onClick={() => setOpen(!open)}
      >
        {account.initials}
      </button>
      {open && (
        <div className="account-pop" role="menu">
          <div className="account-who">
            <strong>{account.name}</strong>
            {account.email && account.email !== account.name && <span>{account.email}</span>}
          </div>
          {LINKS.map((link) => (
            <Link
              key={link.href}
              role="menuitem"
              href={link.href}
              aria-current={pathname === link.href ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          {canInstall(installMode) && (
            <button
              type="button"
              role="menuitem"
              className="account-install"
              onClick={() => {
                setOpen(false);
                startInstall();
              }}
            >
              {installMode === 'ios' ? 'Add to Home Screen' : 'Install the app'}
            </button>
          )}
          {account.isAdmin && (
            <Link role="menuitem" className="account-admin" href="/admin" onClick={() => setOpen(false)}>
              Admin
            </Link>
          )}
          <button type="button" role="menuitem" className="account-signout" onClick={signOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
