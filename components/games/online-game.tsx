'use client';

// One buddy game opened from /games#game=<id>: loads the row, keeps it current (Realtime plus a slow refresh in
// case the socket is blocked) and hands it to the board for that game.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import BuddyChess from '@/components/games/buddy-chess';
import WordRush from '@/components/games/word-rush';
import { useAccount } from '@/lib/account';
import { getMyBuddies } from '@/lib/buddies';
import { fetchGame, openGame, otherOf, startBuddyGame, subscribeGame, type BuddyGame } from '@/lib/buddy-games';
import { getSupabase } from '@/lib/supabase';

const REFRESH_MS = 10_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const leave = () => openGame('');

type Loaded = { id: string; game: BuddyGame | null; buddyName: string };

/** A refresh that was already on its way must not bring back an older version of the game. */
function withGame(s: Loaded | undefined, next: BuddyGame): Loaded | undefined {
  if (!s || s.id !== next.id) return s;
  return s.game && s.game.updated_at > next.updated_at ? s : { ...s, game: next };
}

function Note({ title, text }: { title: string; text: string }) {
  return (
    <section className="chess-game">
      <div className="chess-copy">
        <p className="section-label">Buddy game</p>
        <h2>{title}</h2>
        <p>{text}</p>
        <button className="send-move" type="button" onClick={leave}>
          All games <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}

export default function OnlineGame({ id }: { id: string }) {
  const supabase = getSupabase();
  const { ready, account } = useAccount();
  const me = account?.id ?? null;
  const valid = UUID.test(id);
  // undefined = loading, null = not found or not mine
  const [state, setState] = useState<Loaded | undefined>();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase || !me || !valid) return;
    let live = true;
    const load = async () => {
      const [game, buddies] = await Promise.all([fetchGame(supabase, id), getMyBuddies(supabase)]);
      if (!live) return;
      const buddyName = game ? (buddies?.find((b) => b.id === otherOf(game, me))?.first_name ?? 'your buddy') : '';
      setState((s) => (game && s?.id === id ? withGame({ ...s, buddyName }, game) : { id, game, buddyName }));
    };
    void load();
    const stop = subscribeGame(supabase, id, (game) => live && setState((s) => withGame(s, game)));
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_MS);
    return () => {
      live = false;
      stop();
      window.clearInterval(timer);
    };
  }, [supabase, me, id, valid]);

  if (!supabase)
    return <Note title="Games with a buddy need the live site." text="Open the site to play with a buddy." />;
  if (!ready) return <Note title="Loading your game…" text="One moment." />;
  if (!me)
    return (
      <section className="chess-game">
        <div className="chess-copy">
          <p className="section-label">Buddy game</p>
          <h2>Sign in to play.</h2>
          <Link className="send-move" href={{ pathname: '/signin', query: { next: `/games#game=${id}` } }}>
            Sign in <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    );
  if (!valid) return <Note title="That game link isn’t right." text="Open it again from your Buddy Room." />;

  const current = state?.id === id ? state : undefined;
  if (!current) return <Note title="Loading your game…" text="One moment." />;
  const { game, buddyName } = current;
  if (!game)
    return (
      <Note
        title="This game isn’t available."
        text="It may belong to someone else, or the Buddy Room was closed. Your other games are still there."
      />
    );

  const setGame = (next: BuddyGame) => setState((s) => withGame(s, next));

  if (game.game === 'Slow Chess')
    return (
      <>
        <BuddyChess
          key={`${game.id}-${game.moves.length}-${game.status}`}
          game={game}
          me={me}
          buddyName={buddyName}
          onGame={setGame}
          onLeave={leave}
        />
        {error && <p className="chess-error">{error}</p>}
      </>
    );

  return (
    <>
      <WordRush
        key={game.id}
        deal=""
        online={{
          game,
          me,
          buddyName,
          onGame: setGame,
          onLeave: leave,
          onNewDeal: async () => {
            const started = await startBuddyGame(supabase, otherOf(game, me), 'Word Rush', game.minutes ?? 1);
            if (started.error) return setError(started.error);
            openGame(started.id);
          },
        }}
      />
      {error && <p className="chess-error">{error}</p>}
    </>
  );
}
