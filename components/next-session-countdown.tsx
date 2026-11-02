'use client';

// "While you wait, play a game" (Kelly 2 Nov): counts down to the signed-in member's next booked session, or to
// the next session on the calendar when they have none (or are signed out).
import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useAccount } from '@/lib/account';
import { ROOM_OPENS_MINUTES, addDays, centralDay, fetchMine, fetchRooms, type Room } from '@/lib/rooms';
import { getSupabase } from '@/lib/supabase';

const AHEAD_DAYS = 21;
const noSubscribe = () => () => {};

/** The first session that has not ended, from a list that is already in start order. */
const upcoming = (rooms: Room[] | null, at: number) =>
  rooms?.find((room) => new Date(room.starts_at).getTime() + room.minutes * 60_000 > at) ?? null;

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const rest = [Math.floor((total % 86_400) / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
  return days ? `${days}d ${rest}` : rest;
}

export default function NextSessionCountdown() {
  const supabase = getSupabase();
  const { ready, account } = useAccount();
  const accountId = account?.id ?? null;
  const [found, setFound] = useState<{ room: Room | null; mine: boolean } | undefined>();
  // Server render and hydration agree on 0; the real clock starts after that.
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!supabase || !ready) return;
    let live = true;
    (async () => {
      const at = Date.now();
      const mine = accountId ? upcoming(await fetchMine(supabase), at) : null;
      if (mine) return live && setFound({ room: mine, mine: true });
      const today = centralDay();
      const next = upcoming(await fetchRooms(supabase, today, addDays(today, AHEAD_DAYS)), at);
      if (live) setFound({ room: next, mine: false });
    })();
    return () => {
      live = false;
    };
  }, [supabase, ready, accountId]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const room = found?.room ?? null;
  if (!supabase || !hydrated || !ready || found === undefined || !room) {
    return (
      <div className="next-session-countdown">
        <span>Next session</span>
        <strong>{supabase && (!ready || found === undefined) ? '--:--:--' : 'None yet'}</strong>
        <Link href="/calendar">
          See the calendar <span aria-hidden="true">→</span>
        </Link>
      </div>
    );
  }

  const start = new Date(room.starts_at).getTime();
  const opens = start - ROOM_OPENS_MINUTES * 60_000;
  const end = start + room.minutes * 60_000;
  const label = `${found.mine ? 'Your next session' : 'Next on the calendar'}: ${room.title}`;
  const roomOpen = now >= opens;
  const href = found.mine
    ? roomOpen
      ? ({ pathname: '/camera-check', query: { s: room.slug } } as const)
      : ('/sessions' as const)
    : ({ pathname: '/book', query: { s: room.slug } } as const);
  const linkText = found.mine ? (roomOpen ? 'Go to camera check' : 'See my sessions') : 'See this session';

  return (
    <div className="next-session-countdown">
      <span>{now < start ? `${label} · starts in` : `${label} · happening now`}</span>
      <strong role="timer" aria-live="off">
        {now < start ? clock(start - now) : now < end ? 'Live now' : '00:00:00'}
      </strong>
      <Link href={href}>
        {linkText} <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
