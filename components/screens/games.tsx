'use client';

import AccountMenu from '@/components/account-menu';
import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';
import SlowChess from '@/components/games/slow-chess';
import WordRush from '@/components/games/word-rush';
import OnlineGame from '@/components/games/online-game';
import MenuToggle from '@/components/menu-toggle';
import NextSessionCountdown from '@/components/next-session-countdown';

type GameName = 'word' | 'chess';

// Links into this page: #game=<id> (a game with a buddy, from a Buddy Room or the buddy list), #deal=CODE (a
// Word Rush deal to play solo) and #g=… (a computer chess game). The hash is read when the page opens and on
// hashchange only, because Slow Chess rewrites it with history.replaceState as a computer game goes on.
let openedHash: string | null = null;
function subscribeHash(onChange: () => void) {
  const read = () => {
    openedHash = location.hash;
    onChange();
  };
  read();
  window.addEventListener('hashchange', read);
  return () => {
    window.removeEventListener('hashchange', read);
    openedHash = null;
  };
}
const getHash = () => (openedHash ??= location.hash);

function readLink(hash: string): { game: GameName; deal: string; online: string } {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const deal = (params.get('deal') ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 20);
  const online = (params.get('game') ?? '').slice(0, 40);
  return { game: params.has('g') ? 'chess' : 'word', deal, online };
}

export default function GamesPage() {
  const hash = useSyncExternalStore(subscribeHash, getHash, () => '');
  const link = readLink(hash);
  // A tab picked by hand holds until another link is opened.
  const [picked, setPicked] = useState<{ hash: string; game: GameName } | null>(null);
  const game = picked?.hash === hash ? picked.game : link.game;

  return (
    <main className="games-page">
      <header className="schedule-nav">
        <Link className="schedule-mark" href="/">
          <span>Meet</span>
          <span>Do</span>
          <span>Connect</span>
        </Link>
        <nav aria-label="Games navigation">
          <Link href="/calendar">Calendar</Link>
          <Link href="/sessions">My sessions</Link>
          <Link className="active" href="/games">
            Games
          </Link>
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

      <section className="games-hero">
        <div>
          <p className="section-label">Buddy games</p>
          <h1>
            Two people.
            <br />
            <span>One friendly game.</span>
          </h1>
        </div>
        <NextSessionCountdown />
      </section>

      {link.online ? (
        <OnlineGame key={link.online} id={link.online} />
      ) : (
        <>
          <nav className="game-switch" aria-label="Choose a game">
            <button
              className={game === 'word' ? 'selected' : ''}
              type="button"
              aria-pressed={game === 'word'}
              onClick={() => setPicked({ hash, game: 'word' })}
            >
              <span>01</span>
              <strong>Word Rush</strong>
              <small>Same tiles · computer, solo or a buddy</small>
            </button>
            <button
              className={game === 'chess' ? 'selected' : ''}
              type="button"
              aria-pressed={game === 'chess'}
              onClick={() => setPicked({ hash, game: 'chess' })}
            >
              <span>02</span>
              <strong>Slow Chess</strong>
              <small>Computer or a buddy · one move at a time</small>
            </button>
          </nav>

          {game === 'word' ? <WordRush key={hash} deal={link.deal} /> : <SlowChess key={hash} />}
        </>
      )}
    </main>
  );
}
