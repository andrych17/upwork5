'use client';

// Pieces every live-room game page shares: the header with the step clock, Kelly's Basic Rules, the "What's happening"
// log, the chat break card, and the open / error states. They reuse the Trivia styles (app/trivia.css).
import type { ReactNode } from 'react';
import { type BaseView, clockText, GAME_RULES, GAME_TITLES, type GameKey, type PlayerRow } from '@/lib/live-games';

const LOG_LINES = 10;

export function GameRules({ game, open }: { game: GameKey; open?: boolean }) {
  const r = GAME_RULES[game];
  if (!r) return null;
  return (
    <details className="trivia-rules" open={open}>
      <summary>Basic rules of the game</summary>
      <p>{r.players}</p>
      <p>
        <strong>Object of the game.</strong> {r.object}
      </p>
      <p>
        <strong>How to win.</strong> {r.howToWin}
      </p>
      <ol>
        {r.rules.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ol>
      {r.footer && <p>{r.footer}</p>}
    </details>
  );
}

export function GameNote({ game, title, children }: { game: GameKey; title: string; children?: ReactNode }) {
  return (
    <section className="trivia trivia-note" aria-label={GAME_TITLES[game]}>
      <p className="section-label">{GAME_TITLES[game]}</p>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/** The step name, what to do, the step clock and the time left in the session. */
export function GameHead({
  game,
  step,
  sub,
  view,
  serverNow,
}: {
  game: GameKey;
  step: string;
  sub: string;
  view: BaseView;
  serverNow: number;
}) {
  const playing = view.phase !== 'lobby' && view.phase !== 'over';
  return (
    <div className="trivia-head game-head">
      <div>
        <p className="section-label">{GAME_TITLES[game]}</p>
        <h2>{step}</h2>
        <p className="game-sub">{sub}</p>
      </div>
      {playing && (
        <div className="game-clock" aria-live="off">
          <strong>{view.deadline ? clockText(view.deadline - serverNow) : ''}</strong>
          {view.endsAt > 0 && <span>Session ends in {clockText(view.endsAt - serverNow)}</span>}
        </div>
      )}
    </div>
  );
}

export function GameLog({ lines }: { lines: string[] }) {
  return (
    <section className="trivia-panel" aria-label="What’s happening">
      <h3>What’s happening</h3>
      <ul className="trivia-log" aria-live="polite">
        {lines
          .slice(-LOG_LINES)
          .reverse()
          .map((line, i) => (
            <li key={`${lines.length - i}-${line}`}>{line}</li>
          ))}
      </ul>
    </section>
  );
}

/** Kelly's chat break: a conversation prompt, and anyone can start the next round early. */
export function ChatBreak({
  prompt,
  round,
  busy,
  onNext,
}: {
  prompt: string;
  round: number;
  busy: boolean;
  onNext: () => void;
}) {
  return (
    <div className="trivia-card">
      <div className="trivia-band game-band-break">Chat break</div>
      <div className="trivia-card-body">
        <p className="game-now">{prompt || 'Take a breath and talk.'}</p>
        <p className="trivia-hint">Talk it over with everyone. The next round starts when the timer ends.</p>
        <div className="trivia-actions">
          <button className="trivia-btn" type="button" disabled={busy} onClick={onNext}>
            Everyone’s ready, start round {round + 1}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Scoreboard for the everyone-for-themselves games: rank, player, the latest round, total. */
export function PlayerScores({
  rows,
  me,
  last,
  winners,
}: {
  rows: PlayerRow[];
  me: string;
  last?: { round: number; pts: Record<string, number | string>; label?: string };
  winners?: string[];
}) {
  if (!rows.length) return null;
  return (
    <div className="game-table-wrap">
      <table className="trivia-scores">
        <thead>
          <tr>
            <th className="n">#</th>
            <th>Player</th>
            {last && <th className="n">{last.label ?? `Round ${last.round}`}</th>}
            <th className="n">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const win = winners?.includes(r.id);
            return (
              <tr key={r.id} className={win ? 'win' : r.id === me ? 'me' : undefined}>
                <td className="n">{r.rank}</td>
                <td>
                  <strong>{r.name}</strong>
                  {win && ' ★'}
                  {r.id === me && ' (you)'}
                </td>
                {last && <td className="n">{last.pts[r.id] ?? '–'}</td>}
                <td className="n big">{r.score}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** "X wins!", "X and Y tie for the win!" or "Game over". */
export function winnerTitle(names: string[]): string {
  if (names.length > 1) return `${names.join(' and ')} tie for the win!`;
  return names.length ? `${names[0]} wins!` : 'Game over';
}

export function TeamDot({ color }: { color: string }) {
  return <span className="trivia-swatch game-team-dot" style={{ background: color }} aria-hidden="true" />;
}
