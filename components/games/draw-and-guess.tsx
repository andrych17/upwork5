'use client';

// Draw and Guess in the live room: Kelly's drawing game (DrawAndGuess.html, 11 Nov zip). One player draws a secret
// word, everyone else guesses out loud, and the artist taps the name of whoever got it. Every tap and every line goes
// to game-act, which runs her engine; the word reaches only the artist's page until the turn is over.
import { type ReactNode, useEffect, useEffectEvent, useRef, useState } from 'react';
import DrawPad, { type PadTool } from '@/components/games/draw-pad';
import {
  ChatBreak,
  GameHead,
  GameLog,
  GameNote,
  GameRules,
  PlayerScores,
  winnerTitle,
} from '@/components/games/live-game-parts';
import { PlayerLobby } from '@/components/games/player-parts';
import { type Move, useLiveGame } from '@/components/games/use-live-game';
import { DRAW_COLORS, type DrawView, ERASER, type Stroke } from '@/lib/live-games';

const MAX_PLAYERS = 12;
const SCORING =
  'A guesser earns 5, 3 or 2 points, the faster the more. The artist earns 2 points for every player who guesses. Highest total wins.';
const COLOR_NAMES = ['Black', 'Red', 'Blue', 'Green', 'Orange', 'Purple'];
// Pixel size of the dot on each line-width button.
const NIBS = [5, 10, 20];
// The line in progress goes to the other players at most this often (each send is a save for the whole room).
const LIVE_MS = 500;

type Send = (move: Move, quiet?: boolean) => Promise<boolean>;
type Turn = NonNullable<DrawView['turn']>;

interface Props {
  s: DrawView;
  me: string;
  act: Send;
  busy: boolean;
}

const nameOf = (s: DrawView, id: string | null) => s.players.find((p) => p.id === id)?.name ?? 'someone';

/** Enough to tell two drawings apart: how many lines and how many points. */
const sig = (strokes: Stroke[]) => `${strokes.length}:${strokes.reduce((n, st) => n + st.p.length, 0)}`;

function Guessed({ s, t, reveal }: { s: DrawView; t: Turn; reveal?: boolean }) {
  if (!t.guessed.length)
    return <p className="trivia-hint">{reveal ? 'Nobody guessed it.' : 'Nobody has guessed it yet.'}</p>;
  return (
    <div className="game-chips">
      {t.guessed.map((g) => (
        <span key={g.id} className="game-chip ok">
          {nameOf(s, g.id)} guessed it! +{g.pts}
        </span>
      ))}
    </div>
  );
}

function Choose({ s, me, act, busy }: Props) {
  const t = s.turn!;
  const artist = nameOf(s, t.artist);
  if (t.artist !== me)
    return (
      <div className="trivia-card">
        <div className="trivia-band game-band-draw">{artist} is the artist</div>
        <div className="trivia-card-body">
          <p className="game-now">{artist} is choosing a word…</p>
          <p className="trivia-hint">Get ready. When the drawing starts, shout out your guesses!</p>
        </div>
      </div>
    );
  return (
    <div className="trivia-card">
      <div className="trivia-band game-band-draw">Your turn to draw</div>
      <div className="trivia-card-body">
        <p className="game-now">Pick a word to draw</p>
        <div className="game-cats draw-words">
          {t.options.map((o, i) => (
            <button
              key={o.w}
              type="button"
              className="game-choice"
              disabled={busy}
              onClick={() => void act({ type: 'choose', i })}
            >
              <strong>{o.w}</strong>
              <span>{o.cat}</span>
            </button>
          ))}
        </div>
        <div className="trivia-actions">
          {t.rerolled ? (
            <span className="trivia-hint">You have used your new words.</span>
          ) : (
            <button
              className="trivia-btn big"
              type="button"
              disabled={busy}
              onClick={() => void act({ type: 'reroll' })}
            >
              Show me 3 new words
            </button>
          )}
        </div>
        <p className="trivia-hint">Only you can see these. A word is picked for you if the time runs out.</p>
      </div>
    </div>
  );
}

/**
 * The artist's canvas. The artist's own lines are drawn from this page's copy at once, and sent to the server one
 * after another (the line in progress at most every LIVE_MS, and only the latest one). When everything has been sent
 * and the server's drawing still differs (a line was refused, a reload), the server's drawing wins.
 */
function ArtistBoard({ s, act }: { s: DrawView; act: Send }) {
  const served = s.turn!.strokes;
  const servedSig = sig(served);
  const [mine, setMine] = useState<Stroke[]>(served);
  const [color, setColor] = useState(0);
  const [width, setWidth] = useState(1);
  const [settled, setSettled] = useState(0);
  const queue = useRef<Move[]>([]);
  const sending = useRef(false);
  const lastLive = useRef(0);

  const pump = async () => {
    if (sending.current) return;
    sending.current = true;
    try {
      for (let move = queue.current.shift(); move; move = queue.current.shift()) await act(move, true);
    } finally {
      sending.current = false;
      setSettled((n) => n + 1);
    }
  };
  const push = (move: Move) => {
    // A finished line (or undo, clear) makes any line in progress that is still waiting out of date.
    if (move.type !== 'live') queue.current = queue.current.filter((m) => m.type !== 'live');
    const waiting = queue.current.findIndex((m) => m.type === 'live');
    if (waiting >= 0) queue.current[waiting] = move;
    else queue.current.push(move);
    void pump();
  };

  const heal = useEffectEvent(() => {
    if (sending.current || queue.current.length || sig(mine) === servedSig) return;
    setMine(served);
  });
  useEffect(() => {
    heal();
  }, [servedSig, settled]);
  useEffect(() => {
    const waiting = queue;
    return () => {
      waiting.current = [];
    };
  }, []);

  const tool: PadTool = {
    color,
    width,
    onLive: (stroke) => {
      const now = Date.now();
      if (now - lastLive.current < LIVE_MS) return;
      lastLive.current = now;
      push({ type: 'live', stroke });
    },
    onStroke: (stroke) => {
      setMine((m) => [...m, stroke]);
      push({ type: 'stroke', stroke });
    },
  };

  return (
    <>
      <div className="draw-wrap">
        <DrawPad strokes={mine} live={null} tool={tool} />
      </div>
      <div className="draw-tools" role="group" aria-label="Drawing tools">
        {DRAW_COLORS.slice(0, ERASER).map((c, i) => (
          <button
            key={c}
            type="button"
            className="draw-swatch"
            style={{ background: c }}
            aria-label={COLOR_NAMES[i]}
            aria-pressed={color === i}
            onClick={() => setColor(i)}
          />
        ))}
        {NIBS.map((px, w) => (
          <button
            key={px}
            type="button"
            className="draw-nib"
            aria-label={`Line width ${w + 1}`}
            aria-pressed={width === w}
            onClick={() => setWidth(w)}
          >
            <i style={{ width: px, height: px }} />
          </button>
        ))}
        <button
          className="trivia-btn"
          type="button"
          aria-pressed={color === ERASER}
          aria-label="Eraser: rub out part of the drawing"
          onClick={() => setColor(ERASER)}
        >
          Eraser
        </button>
        <button
          className="trivia-btn"
          type="button"
          onClick={() => {
            if (!mine.length) return;
            setMine(mine.slice(0, -1));
            push({ type: 'undo' });
          }}
        >
          Undo
        </button>
        <button
          className="trivia-btn"
          type="button"
          onClick={() => {
            if (!mine.length) return;
            setMine([]);
            push({ type: 'clear' });
          }}
        >
          Clear
        </button>
      </div>
    </>
  );
}

function Draw({ s, me, act, busy }: Props) {
  const t = s.turn!;
  const artist = nameOf(s, t.artist);
  const mine = t.artist === me;
  const others = s.players.filter((p) => p.id !== t.artist);
  return (
    <div className="trivia-card">
      <div className="trivia-band game-band-draw">{mine ? 'You are drawing' : `${artist} is drawing`}</div>
      <div className="trivia-card-body">
        {mine ? (
          <>
            <p className="trivia-hint">Draw this, with no letters, numbers or talking:</p>
            <p className="draw-word">{t.word}</p>
            <ArtistBoard key={`${s.round}:${s.idx}`} s={s} act={act} />
            <p className="game-role">
              <strong>Tap the name of whoever says the right answer out loud:</strong>
            </p>
            <div className="game-names">
              {others.map((p) => {
                const got = t.guessed.find((g) => g.id === p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={busy || !!got}
                    onClick={() => void act({ type: 'guessed', who: p.id })}
                  >
                    {p.name}
                    {got && ` ✓ +${got.pts}`}
                  </button>
                );
              })}
            </div>
            <div className="trivia-actions">
              <button className="trivia-btn" type="button" disabled={busy} onClick={() => void act({ type: 'giveup' })}>
                End this turn
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="game-now">{artist} is drawing. Say your guess out loud!</p>
            <div className="draw-wrap">
              <DrawPad strokes={t.strokes} live={t.live} />
            </div>
            <Guessed s={s} t={t} />
            <p className="trivia-hint">Shout your guesses out loud. No typing.</p>
          </>
        )}
      </div>
    </div>
  );
}

function Reveal({ s }: { s: DrawView }) {
  const t = s.turn!;
  return (
    <div className="trivia-card">
      <div className="trivia-band game-band-draw">The word was…</div>
      <div className="trivia-card-body">
        <p className="trivia-hint">
          {t.note && `${t.note} `}
          {nameOf(s, t.artist)} was drawing:
        </p>
        <p className="draw-word">{t.word}</p>
        <div className="draw-wrap">
          <DrawPad strokes={t.strokes} live={null} />
        </div>
        <Guessed s={s} t={t} reveal />
        <p className="trivia-hint">The next turn starts by itself.</p>
      </div>
    </div>
  );
}

function stepOf(s: DrawView, me: string): [string, string] {
  const t = s.turn;
  const artist = nameOf(s, t?.artist ?? null);
  const round = `Round ${s.round}${s.phase === 'break' ? '' : ` · turn ${s.idx + 1} of ${s.order.length}`} · `;
  if (s.phase === 'choose') return [`${round}${artist} is choosing a word`, 'Get ready to guess out loud!'];
  if (s.phase === 'draw')
    return t?.artist === me
      ? [`${round}You are drawing`, 'No letters, numbers, talking or pointing.']
      : [`${round}${artist} is drawing`, 'Shout your guesses out loud. No typing!'];
  if (s.phase === 'reveal') return [`${round}The word was…`, 'Points are in.'];
  return [`${round}Chat break`, 'Take a breath and talk.'];
}

export default function DrawAndGuess({ sessionId, me }: { sessionId: string; me: string }) {
  const { view: s, act, busy, msg, joinError, retry, serverNow } = useLiveGame<DrawView>(sessionId, me);

  if (!s)
    return joinError ? (
      <GameNote game="draw-and-guess" title="The game didn’t open.">
        <p>{joinError}</p>
        <button className="trivia-btn primary" type="button" onClick={retry}>
          Try again
        </button>
      </GameNote>
    ) : (
      <GameNote game="draw-and-guess" title="Setting up the game…" />
    );

  const notice = msg || joinError;
  const head = (step: string, sub: string) => (
    <>
      <GameHead game="draw-and-guess" step={step} sub={sub} view={s} serverNow={serverNow} />
      {notice && <p className="trivia-msg">{notice}</p>}
    </>
  );

  if (s.phase === 'lobby')
    return (
      <section className="trivia" aria-label="Draw and Guess">
        {head('Draw and Guess', `${s.players.length} of ${MAX_PLAYERS} players`)}
        <PlayerLobby game="draw-and-guess" dot="game-dot-draw" players={s.players} me={me} act={act} busy={busy} />
      </section>
    );

  if (s.phase === 'over') {
    const names = s.winners.map((id) => nameOf(s, id));
    return (
      <section className="trivia" aria-label="Draw and Guess">
        {head(winnerTitle(names), `Final scores after ${s.round} round${s.round === 1 ? '' : 's'}`)}
        <div className="trivia-panel">
          <PlayerScores rows={s.ui.board} me={me} winners={s.winners} />
          <div className="trivia-actions">
            <button
              className="trivia-btn primary big"
              type="button"
              disabled={busy}
              onClick={() => void act({ type: 'again' })}
            >
              Play again with the same players
            </button>
          </div>
        </div>
        <GameLog lines={s.log} />
      </section>
    );
  }

  const gains = Object.fromEntries(s.ui.board.map((r) => [r.id, r.gain ? `+${r.gain}` : '–']));
  const board = (
    <PlayerScores
      rows={s.ui.board}
      me={me}
      last={s.phase === 'break' ? undefined : { round: s.round, pts: gains, label: 'This turn' }}
    />
  );
  const props = { s, me, act, busy };
  let main: ReactNode;
  if (s.phase === 'choose' && s.turn) main = <Choose {...props} />;
  else if (s.phase === 'draw' && s.turn) main = <Draw {...props} />;
  else if (s.phase === 'reveal' && s.turn) main = <Reveal s={s} />;
  else
    main = (
      <ChatBreak
        prompt={s.brk?.prompt ?? ''}
        round={s.round}
        busy={busy}
        onNext={() => void act({ type: 'nextround' })}
      />
    );

  const [step, sub] = stepOf(s, me);
  return (
    <section className="trivia" aria-label="Draw and Guess">
      {head(step, sub)}
      <div className="trivia-play game-play">
        <div className="trivia-side game-main">{main}</div>
        <div className="trivia-board-col">
          <section className="trivia-panel" aria-label="Scoreboard">
            <h3>Scoreboard</h3>
            {board}
            <p className="trivia-hint">{SCORING}</p>
          </section>
          <GameLog lines={s.log} />
          <section className="trivia-panel">
            <GameRules game="draw-and-guess" />
          </section>
        </div>
      </div>
    </section>
  );
}
