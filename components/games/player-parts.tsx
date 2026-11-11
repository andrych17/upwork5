'use client';

// The lobby of the everyone-for-themselves games (Guess Whose Story, Draw and Guess): who is in, rules, Start.
import { GameRules } from '@/components/games/live-game-parts';
import type { Act } from '@/components/games/team-parts';
import type { GameKey, Player } from '@/lib/live-games';

const MIN_PLAYERS = 2;

export function PlayerLobby({
  game,
  dot,
  players,
  me,
  act,
  busy,
}: {
  game: GameKey;
  /** class that colours the dot in front of each name */
  dot: string;
  players: Player[];
  me: string;
  act: Act;
  busy: boolean;
}) {
  const mine = players.some((p) => p.id === me);
  const ready = players.length >= MIN_PLAYERS;
  return (
    <div className="trivia-panel trivia-lobby">
      <h3>Waiting to start</h3>
      <GameRules game={game} open />
      <ul className="trivia-players">
        {players.map((p) => (
          <li key={p.id} className="trivia-player">
            <span className={`trivia-swatch game-team-dot ${dot}`} aria-hidden="true" />
            <strong>
              {p.name}
              {p.id === me && <small>you</small>}
            </strong>
          </li>
        ))}
      </ul>
      <div className="trivia-actions">
        <button
          className="trivia-btn primary big"
          type="button"
          disabled={busy || !ready || !mine}
          onClick={() => void act({ type: 'start' })}
        >
          Start the game
        </button>
        <span className="trivia-hint">
          {ready ? 'Anyone can press Start.' : `Need at least ${MIN_PLAYERS} players (${players.length} so far).`}
        </span>
      </div>
    </div>
  );
}
