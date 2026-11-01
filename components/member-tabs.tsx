'use client';

// Tab bar at the bottom of the screen on phones and small tablets, for signed-in members: Rooms (with how
// many rooms can still be booked in the next 7 days), My sessions (how many upcoming seats they hold), Games, Credits, Admin
// for admins. Hidden on wide screens, where the header links do the same job. Styles in app/nav.css.
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useAccount } from '@/lib/account';
import { addDays, addMinutes, centralDay, fetchMine, fetchRooms, isOpen, type Room } from '@/lib/rooms';
import { getSupabase } from '@/lib/supabase';
import { useNow } from '@/lib/use-now';

// Rooms badge: sessions still bookable from today (Central) through this many days.
const OPEN_DAYS = 7;

// Pages with their own full-screen layout or no member context.
const HIDDEN = ['/admin', '/signin', '/signup', '/live-room', '/camera-check', '/states', '/p2', '/offline'];

const icon = (d: ReactNode) => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {d}
  </svg>
);

const ICONS = {
  rooms: icon(
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>,
  ),
  sessions: icon(
    <>
      <path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v3a2.5 2.5 0 0 0 0 5v3a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17v-3a2.5 2.5 0 0 0 0-5V6A1.5 1.5 0 0 1 5 4.5z" />
      <path d="M9 12l2 2 4-4" />
    </>,
  ),
  games: icon(
    <>
      <rect x="2.5" y="7" width="19" height="11" rx="5.5" />
      <path d="M7 11v3M5.5 12.5h3M15.5 11.5h.01M18 13.5h.01" />
    </>,
  ),
  credits: icon(
    <>
      <rect x="3" y="6" width="18" height="13" rx="3" />
      <path d="M3 10.5h18M7 15h4" />
    </>,
  ),
  admin: icon(
    <>
      <path d="M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6z" />
      <path d="M9 12l2 2 4-4" />
    </>,
  ),
};

interface Counts {
  key: string;
  soon: Room[] | null;
  mine: Room[] | null;
}

export default function MemberTabs() {
  const { account } = useAccount();
  const pathname = usePathname().replace(/\/$/, '') || '/';
  const supabase = getSupabase();
  const now = useNow();
  // Counted again on every page change, so a booking or cancel shows on the next screen.
  const key = `${account?.id ?? ''}|${pathname}`;
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    if (!supabase || !account) return;
    let live = true;
    const today = centralDay();
    Promise.all([fetchRooms(supabase, today, addDays(today, OPEN_DAYS)), fetchMine(supabase)]).then(([rooms, mine]) => {
      if (live) setCounts({ key, soon: rooms, mine });
    });
    return () => {
      live = false;
    };
  }, [supabase, account, key]);

  if (!account || HIDDEN.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  // Keep the last numbers while the next page's count loads, so the badges do not blink.
  const current = counts?.key.startsWith(`${account.id}|`) ? counts : null;
  const openSoon = current?.soon ? current.soon.filter((room) => isOpen(room, now)).length : null;
  const mine = current?.mine
    ? current.mine.filter((room) => new Date(addMinutes(room.starts_at, room.minutes)).getTime() > now).length
    : null;
  const tabs: {
    href: Route;
    label: string;
    icon: ReactNode;
    active: boolean;
    badge?: number | null;
    badgeLabel?: string;
  }[] = [
    {
      href: '/calendar',
      label: 'Rooms',
      icon: ICONS.rooms,
      active: pathname === '/calendar' || pathname.startsWith('/book'),
      badge: openSoon,
      badgeLabel: `${openSoon} ${openSoon === 1 ? 'room' : 'rooms'} open in the next ${OPEN_DAYS} days`,
    },
    {
      href: '/sessions',
      label: 'My sessions',
      icon: ICONS.sessions,
      active: pathname === '/sessions',
      badge: mine,
      badgeLabel: `${mine} booked`,
    },
    { href: '/games', label: 'Games', icon: ICONS.games, active: pathname.startsWith('/games') },
    {
      href: '/membership',
      label: 'Credits',
      icon: ICONS.credits,
      active: pathname === '/membership' || pathname === '/reminders' || pathname === '/hello-video',
    },
  ];
  if (account.isAdmin) tabs.push({ href: '/admin', label: 'Admin', icon: ICONS.admin, active: false });

  return (
    <nav className="member-tabs" aria-label="Member menu">
      {tabs.map((tab) => (
        <Link key={tab.href} href={tab.href} aria-current={tab.active ? 'page' : undefined}>
          <span className="member-tab-icon">
            {tab.icon}
            {tab.badge ? (
              <span className="member-tab-badge" aria-label={tab.badgeLabel}>
                {tab.badge > 9 ? '9+' : tab.badge}
              </span>
            ) : null}
          </span>
          <span className="member-tab-label">{tab.label}</span>
        </Link>
      ))}
    </nav>
  );
}
