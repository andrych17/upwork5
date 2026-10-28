'use client';

import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';
import SlowChess from '@/components/games/slow-chess';
import WordRush from '@/components/games/word-rush';
import MenuToggle from '@/components/menu-toggle';
import { cleanName } from '@/lib/slow-chess/engine';

type GameName = 'word' | 'chess';

// Links into this page: #deal=CODE (a Word Rush deal), #g=… (a Slow Chess game) and #play=word|chess&with=Name
// from the Buddy Room invite buttons. The hash is read when the page opens and on hashchange only, because
// Slow Chess rewrites it with history.replaceState as the game goes on.
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

function readLink(hash: string): { game: GameName; deal: string; buddy: string } {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const deal = (params.get('deal') ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 20);
  const buddy = cleanName(params.get('with'), '');
  const game = params.has('g') || params.get('play') === 'chess' ? 'chess' : 'word';
  return { game, deal, buddy };
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
        <Link className="schedule-signin" href="/sessions">
          My sessions
        </Link>
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
        <div className="next-session-countdown">
          <span>Quiet Co-Work opens in</span>
          <strong>00:18:42</strong>
          <Link href="/camera-check">
            Go to camera check <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

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

      {game === 'word' ? (
        <WordRush key={hash} deal={link.deal} buddy={link.buddy} />
      ) : (
        <SlowChess key={hash} buddy={link.buddy} />
      )}
    </main>
  );
}
