'use client';

// Slow Chess with a buddy, saved in the database (schema section 27). The board is the one from slow-chess.tsx.
// On my turn I tap a piece and a square, the move shows on the board, and one Play button sends it. The other
// person's move arrives by itself (the parent re-renders this with the new game, keyed by the move count).
import { useState } from 'react';
import { Board, PROMO, glyph, initials } from '@/components/games/slow-chess';
import { chessMover, playChessMove, type BuddyGame } from '@/lib/buddy-games';
import { getSupabase } from '@/lib/supabase';
import { colorOf, replay, uci, type Move, type Replay } from '@/lib/slow-chess/engine';

interface Props {
  game: BuddyGame;
  me: string;
  buddyName: string;
  onGame: (game: BuddyGame) => void;
  onLeave: () => void;
}

export default function BuddyChess({ game, me, buddyName, onGame, onLeave }: Props) {
  const supabase = getSupabase();
  const iAmWhite = game.white_id === me;
  const [sel, setSel] = useState(-1);
  const [promo, setPromo] = useState<Move[] | null>(null);
  const [staged, setStaged] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(!iAmWhite);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const tokens = staged ? [...game.moves, staged] : game.moves;
  const r = replay(tokens);
  if ('error' in r) {
    return (
      <section className="chess-game" id="slow-chess">
        <div className="chess-copy">
          <p className="section-label">Slow Chess</p>
          <h2>This game can’t be shown.</h2>
          <p className="chess-error">{r.error}</p>
          <button className="send-move" type="button" onClick={onLeave}>
            Back to my games
          </button>
        </div>
      </section>
    );
  }

  const st = r.state;
  const over = game.status === 'done' || !!r.over;
  const myTurn = chessMover(game) === me && !staged;
  const turnName = st.turn === 'w' ? (iAmWhite ? 'You' : buddyName) : iAmWhite ? buddyName : 'You';
  const names = { w: iAmWhite ? 'You' : buddyName, b: iAmWhite ? buddyName : 'You' };
  const pairs = Array.from({ length: Math.ceil(r.sans.length / 2) }, (_, k) => r.sans.slice(k * 2, k * 2 + 2));

  let status: { title: string; text: string };
  const winner = game.result ?? (r.over || null);
  if (over)
    status = {
      title: winner === 'd' ? 'Draw' : winner === (iAmWhite ? 'w' : 'b') ? 'You win' : `${buddyName} wins`,
      text: `${r.why || 'Resigned'}.`,
    };
  else if (staged) status = { title: 'Move ready', text: 'Press Play to send it. Changed your mind? Undo.' };
  else if (myTurn)
    status = {
      title: `${r.check ? 'Check. ' : ''}Your move`,
      text: 'Tap a piece, then tap where it goes. Dots show legal moves.',
    };
  else
    status = {
      title: `${r.check ? 'Check. ' : ''}${buddyName}’s move`,
      text: 'Their move shows up here as soon as they play. You can leave and come back.',
    };

  function stage(token: string) {
    setStaged(token);
    setSel(-1);
    setPromo(null);
    setError('');
  }
  function tap(i: number) {
    if (!myTurn || promo) return;
    if (sel >= 0) {
      const cands = (r as Replay).legal.filter((m) => m.from === sel && m.to === i);
      if (cands[0]?.promo) return setPromo(cands);
      if (cands[0]) return stage(uci(cands[0]));
    }
    const p = st.b[i];
    setSel(p && colorOf(p) === st.turn && sel !== i ? i : -1);
  }

  async function send(token: string) {
    if (!supabase || busy) return;
    const next = replay([...game.moves, token]);
    const result = 'error' in next || !next.over ? null : next.over;
    setBusy(true);
    const res = await playChessMove(supabase, game.id, game.moves.length, token, result);
    setBusy(false);
    if (res.error || !res.game) {
      setStaged(null);
      return setError(res.error || 'Could not send the move. Please try again.');
    }
    setStaged(null);
    onGame(res.game);
  }

  return (
    <section className="chess-game" id="slow-chess">
      <div className="chess-copy">
        <p className="section-label">Slow Chess</p>
        <h2>You and {buddyName}.</h2>
        <div className="chess-players">
          {(['w', 'b'] as const).map((color) => (
            <div className={`chess-opponent ${!over && st.turn === color ? 'chess-to-move' : ''}`} key={color}>
              <div className={`opponent-mark ${color === 'w' ? 'mark-white' : ''}`}>
                {names[color] === 'You' ? 'You' : initials(names[color])}
              </div>
              <div>
                <strong>{names[color]}</strong>
                <span>{color === 'w' ? 'White' : 'Black'}</span>
              </div>
            </div>
          ))}
        </div>
        <div className={`move-status ${r.check || over ? 'move-status-alert' : ''}`} role="status" aria-live="polite">
          <strong>{status.title}</strong>
          <span>{status.text}</span>
        </div>
        {error && <p className="chess-error">{error}</p>}
        <div className="chess-actions">
          <button type="button" disabled={!staged || busy} onClick={() => setStaged(null)}>
            Undo my move
          </button>
          <button type="button" onClick={() => setFlipped(!flipped)}>
            Flip board
          </button>
          <button
            type="button"
            disabled={!myTurn || over || busy}
            onClick={() => confirm('Resign this game?') && void send('r')}
          >
            Resign
          </button>
          <button type="button" onClick={onLeave}>
            All games
          </button>
        </div>
        <div className="chess-moves">
          <h3>Moves</h3>
          <ol>
            {pairs.length ? (
              pairs.map(([a, b], k) => (
                <li key={k}>
                  <b>{k + 1}.</b> {a}
                  {b && ` ${b}`}
                </li>
              ))
            ) : (
              <li>No moves yet.</li>
            )}
          </ol>
        </div>
      </div>
      <div className="chess-board-wrap">
        <Board r={r} flipped={flipped} sel={sel} onTap={tap} />
        {promo && (
          <div className="chess-promo" role="group" aria-label="Promote to">
            <span>Promote to</span>
            {PROMO.map(([x, name]) => {
              const m = promo.find((c) => c.promo === x);
              return (
                <button type="button" aria-label={name} key={x} onClick={() => m && stage(uci(m))}>
                  {glyph(st.turn === 'w' ? x.toUpperCase() : x)}
                </button>
              );
            })}
          </div>
        )}
        {!over && (
          <button
            className="send-move"
            type="button"
            disabled={!staged || busy}
            onClick={() => staged && void send(staged)}
          >
            {busy
              ? 'Sending…'
              : staged
                ? 'Play'
                : myTurn
                  ? 'Make your move'
                  : `Waiting for ${turnName === 'You' ? buddyName : turnName}`}{' '}
            <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
    </section>
  );
}
