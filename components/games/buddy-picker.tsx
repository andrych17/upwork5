'use client';

// "With a buddy": the people I'm matched with in Buddy Rooms, each with the state of our game (whose move,
// scores). One tap on a row starts that game or goes back to it, so several games can run side by side.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAccount } from '@/lib/account';
import { getMyBuddies, type Buddy, type GameName } from '@/lib/buddies';
import {
  fetchGames,
  gameStatus,
  openGame,
  otherOf,
  startBuddyGame,
  subscribeMyGames,
  type BuddyGame,
} from '@/lib/buddy-games';
import { getSupabase } from '@/lib/supabase';

interface Props {
  game: GameName;
  /** Word Rush: minutes for a new game (an open game keeps its own) */
  minutes?: number;
}

export default function BuddyPicker({ game, minutes = 1 }: Props) {
  const supabase = getSupabase();
  const { ready, account } = useAccount();
  const me = account?.id ?? null;
  const [data, setData] = useState<{ buddies: Buddy[] | null; games: BuddyGame[] | null } | undefined>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase || !me) return;
    let live = true;
    const load = () =>
      Promise.all([getMyBuddies(supabase), fetchGames(supabase)]).then(([buddies, games]) => {
        if (live) setData({ buddies, games });
      });
    void load();
    const stop = subscribeMyGames(supabase, me, () => void load());
    return () => {
      live = false;
      stop();
    };
  }, [supabase, me]);

  async function play(buddy: Buddy) {
    if (!supabase || busy) return;
    setBusy(buddy.id);
    setError('');
    const started = await startBuddyGame(supabase, buddy.id, game, minutes);
    setBusy('');
    if (started.error) return setError(started.error);
    openGame(started.id);
  }

  let body;
  if (!supabase) body = <p className="chess-note">Games with a buddy need the live site.</p>;
  else if (!ready || (me && !data)) body = <p className="chess-note">Loading your buddies…</p>;
  else if (!me)
    body = (
      <p className="chess-note">
        <Link href={{ pathname: '/signin', query: { next: '/games' } }}>Sign in</Link> to play with a buddy.
      </p>
    );
  else if (data?.buddies === null)
    body = <p className="chess-error">Couldn’t load your buddies. Refresh to try again.</p>;
  else if (!data?.buddies?.length)
    body = (
      <p className="chess-note">
        Buddies appear after a session, when you and someone from the group both choose each other.{' '}
        <Link href="/after-session">Go to Buddy Rooms</Link>
      </p>
    );
  else {
    const rows = data.buddies
      .map((buddy) => {
        const active = data.games?.find((g) => g.game === game && g.status === 'active' && otherOf(g, me) === buddy.id);
        const last = data.games?.find((g) => g.game === game && otherOf(g, me) === buddy.id);
        const state = active ?? last;
        return { buddy, active, status: state ? gameStatus(state, me, buddy.first_name) : null };
      })
      .sort((a, b) => Number(!!b.status?.mine) - Number(!!a.status?.mine));
    body = (
      <ul className="buddy-picker-list">
        {rows.map(({ buddy, active, status }) => (
          <li key={buddy.id}>
            <span className="opponent-mark">{buddy.first_name.charAt(0).toUpperCase()}</span>
            <div>
              <strong>{buddy.first_name}</strong>
              <span>{status ? status.text : 'No game yet'}</span>
            </div>
            <button
              className={status?.mine ? 'buddy-play-now' : ''}
              type="button"
              disabled={!!busy}
              onClick={() => void play(buddy)}
            >
              {busy === buddy.id ? 'Opening…' : active ? (status?.mine ? 'Play' : 'Open') : 'Play'}
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="buddy-picker">
      <h3>Play with a buddy</h3>
      <p className="chess-note">
        Pick a buddy to start {game === 'Word Rush' ? 'a Word Rush deal' : 'a game'} or go back to the one you have
        going. You can have a game with each buddy at the same time.
      </p>
      {body}
      {error && <p className="chess-error">{error}</p>}
    </div>
  );
}
