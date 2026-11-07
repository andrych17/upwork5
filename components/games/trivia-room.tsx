'use client';

// Trivia, Trivier, Triviest inside the live room: Kelly's board game (trivia.html in her 7 Nov zip) for the
// people in the session, each on their own device. Every move goes to the trivia-act Edge Function, which runs her
// engine and saves the game; everyone gets the new state through Realtime, with a short refresh as a fallback.
// The page never has the answers: the card lists the choices in display order and `last` shows what was right.
import { type ReactNode, useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { callEdge } from '@/lib/edge';
import { getSupabase } from '@/lib/supabase';
import {
  ACTION_SECONDS,
  BADGE_AFTER,
  BADGE_BONUS,
  MAX_PLAYERS,
  PLAYER_COLOURS,
  POINTS_PER_RIGHT,
  SPACES_PER_COLOUR,
  TRIVIA_RULES,
  board,
  clockLeft,
  inkOn,
  newer,
  roomCategories,
  scoreboard,
  wheelAfter,
  winnersOf,
  type TriviaCategory,
  type TriviaMove,
  type TriviaPlayer,
  type TriviaSnapshot,
  type TriviaState,
} from '@/lib/trivia';

interface ActResult extends TriviaSnapshot {
  now: number;
  categories: TriviaCategory[];
}

interface View {
  snap: TriviaSnapshot;
  wheel: number;
}

const REFRESH_MS = 3000;
const TICK_MS = 250;
// When time runs out, the first player sends the timeout a moment after the deadline and the others a little
// later each, so the game moves on even if the player whose turn it is has closed the page.
const TIMEOUT_GRACE_MS = 300;
const TIMEOUT_STAGGER_MS = 700;
const LOG_LINES = 8;
const RANDOM_THEME = 3;

const send = (sessionId: string, action: TriviaMove) =>
  callEdge<ActResult>('trivia-act', { session_id: sessionId, action });

/** Takes this person out of the game when they leave the room (their turns stop coming round). */
export function leaveTrivia(sessionId: string): void {
  void send(sessionId, { type: 'leave' });
}

const at = (i: number, n: number, r: number) => {
  const a = ((-90 + (i * 360) / n) * Math.PI) / 180;
  return { x: 300 + r * Math.cos(a), y: 300 + r * Math.sin(a) };
};

function Wheel({ deg }: { deg: number }) {
  return (
    <>
      <g className="trivia-wheel" style={{ transform: `rotate(${deg}deg)` }}>
        {[0, 1, 2, 3, 4, 5].map((k) => {
          const a0 = ((-90 + k * 60) * Math.PI) / 180;
          const a1 = ((-90 + (k + 1) * 60) * Math.PI) / 180;
          const mid = (a0 + a1) / 2;
          const p = (a: number, r: number) =>
            `${(300 + r * Math.cos(a)).toFixed(1)} ${(300 + r * Math.sin(a)).toFixed(1)}`;
          const tx = 300 + 66 * Math.cos(mid);
          const ty = 300 + 66 * Math.sin(mid) + 9;
          return (
            <g key={k}>
              <path
                d={`M300 300 L${p(a0, 96)} A96 96 0 0 1 ${p(a1, 96)} Z`}
                fill={k % 2 ? '#e3dccd' : '#f1ece2'}
                stroke="#8a8f88"
                strokeWidth="1.5"
              />
              <text x={tx.toFixed(1)} y={ty.toFixed(1)} textAnchor="middle" fontSize="26" fontWeight="700" fill="#222">
                {k + 1}
              </text>
            </g>
          );
        })}
      </g>
      <path d="M300 196 L290 176 L310 176 Z" fill="#d1495b" stroke="#fff" strokeWidth="2" />
    </>
  );
}

function Board({
  s,
  cats,
  wheel,
  myTurn,
  onMove,
}: {
  s: TriviaState;
  cats: TriviaCategory[];
  wheel: number;
  myTurn: boolean;
  onMove: (to: number) => void;
}) {
  const n = s.nCats * SPACES_PER_COLOUR;
  const spaces = board(s.nCats);
  const options = s.phase === 'move' ? s.options : [];
  const byPos = new Map<number, number[]>();
  s.players.forEach((p, k) => byPos.set(p.pos, [...(byPos.get(p.pos) ?? []), k]));
  const playing = s.phase !== 'lobby' && s.phase !== 'over';

  return (
    <svg className="trivia-board" viewBox="0 0 600 600" role="group" aria-label="Game board">
      <circle cx="300" cy="300" r="266" fill="none" stroke="var(--t-line)" strokeWidth="2" />
      <circle cx="300" cy="300" r="112" fill="var(--t-bg)" stroke="var(--t-line)" strokeWidth="2" />
      {spaces.map((sp) => {
        const p = at(sp.i, n, 250);
        if (sp.type === 'roll')
          return (
            <g key={sp.i}>
              <circle cx={p.x} cy={p.y} r="17" fill="#fff" stroke="#8a8f88" strokeWidth="2" />
              <text x={p.x} y={p.y + 7} textAnchor="middle" fontSize="20" fill="#444">
                ↻
              </text>
            </g>
          );
        const color = cats[sp.cat]?.color ?? '#888888';
        return <circle key={sp.i} cx={p.x} cy={p.y} r="15" fill={color} stroke="#fff" strokeWidth="2" />;
      })}
      <Wheel deg={wheel} />
      <text x="300" y="448" textAnchor="middle" fontSize="15" fill="var(--t-muted)">
        {s.phase === 'spin' || s.phase === 'move' ? `Spin: ${s.spin ?? '–'}` : ''}
      </text>
      {[...byPos.entries()].map(([pos, list]) => {
        const base = at(pos, n, 250);
        const spread = list.length > 6 ? 17 : list.length > 1 ? 11 : 0;
        const small = list.length > 6;
        return list.map((k, j) => {
          const a = (j / list.length) * Math.PI * 2;
          const x = base.x + spread * Math.cos(a);
          const y = base.y + spread * Math.sin(a);
          const turn = playing && k === s.turn;
          return (
            <circle
              key={s.players[k].id}
              className={turn ? 'trivia-pulse' : undefined}
              cx={x.toFixed(1)}
              cy={y.toFixed(1)}
              r={small ? 8 : 10}
              fill={PLAYER_COLOURS[s.players[k].color]}
              stroke={turn ? '#000' : '#fff'}
              strokeWidth={turn ? 3 : 2}
            />
          );
        });
      })}
      {options.map((to, k) => {
        const q = at(to, n, 250);
        const label = `Move ${k === 0 ? 'clockwise' : 'counter-clockwise'}, space ${to + 1}`;
        return (
          <g
            key={to}
            role="button"
            tabIndex={myTurn ? 0 : -1}
            aria-label={label}
            aria-disabled={!myTurn}
            className={myTurn ? 'trivia-target' : undefined}
            onClick={() => myTurn && onMove(to)}
            onKeyDown={(e) => {
              if (myTurn && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onMove(to);
              }
            }}
          >
            <circle
              className="trivia-pulse"
              cx={q.x}
              cy={q.y}
              r="30"
              fill="rgba(255,255,255,0.25)"
              stroke="#000"
              strokeWidth="3"
              strokeDasharray="5 4"
            />
          </g>
        );
      })}
    </svg>
  );
}

const GLASS = 'M18 10 H82 C82 50 56 64 56 80 C56 96 82 110 82 150 H18 C18 110 44 96 44 80 C44 64 18 50 18 10 Z';

function Hourglass({ f, running }: { f: number; running: boolean }) {
  const yTop = 16 + (1 - f) * 62;
  const yBot = 148 - (1 - f) * 62;
  return (
    <svg className="trivia-glass" viewBox="0 0 100 160" role="img" aria-label="Hourglass">
      <defs>
        <clipPath id="trivia-glass-clip">
          <path d={GLASS} />
        </clipPath>
      </defs>
      <g clipPath="url(#trivia-glass-clip)">
        <rect x="0" y={yTop.toFixed(1)} width="100" height={(80 - yTop + 2).toFixed(1)} fill="var(--t-sand)" />
        <rect x="0" y={yBot.toFixed(1)} width="100" height={(150 - yBot).toFixed(1)} fill="var(--t-sand)" />
        {running && f > 0.003 && (
          <rect x="49" y="80" width="2" height={Math.max(0, yBot - 80).toFixed(1)} fill="var(--t-sand)" />
        )}
      </g>
      <path d={GLASS} fill="rgba(125,149,141,0.12)" stroke="var(--t-glass)" strokeWidth="3" />
      <rect x="12" y="4" width="76" height="7" rx="3" fill="var(--t-glass)" />
      <rect x="12" y="149" width="76" height="7" rx="3" fill="var(--t-glass)" />
    </svg>
  );
}

function PlayerRow({
  p,
  k,
  s,
  cats,
  me,
}: {
  p: TriviaPlayer;
  k: number;
  s: TriviaState;
  cats: TriviaCategory[];
  me: string;
}) {
  const turn = s.phase !== 'lobby' && s.phase !== 'over' && k === s.turn;
  const tags = [p.id === me && 'you', p.id === s.timekeeper && 'Timer', p.away && 'away'].filter(Boolean);
  return (
    <li className={turn ? 'trivia-player now' : 'trivia-player'}>
      <span className="trivia-dot" style={{ background: PLAYER_COLOURS[p.color] }} />
      <div>
        <strong>{p.name}</strong>
        {s.phase !== 'lobby' && (
          <span className="trivia-score" title="Score: points">
            {p.points ?? 0}
          </span>
        )}
        {turn && <span className="trivia-turn-tag"> ◀ turn</span>}
        {tags.length > 0 && <small>{tags.join(' · ')}</small>}
      </div>
      <span className="trivia-pips" aria-label={`Badges: ${p.badges.filter(Boolean).length} of ${p.badges.length}`}>
        {cats.map((c, i) => (
          <span
            key={c.id}
            className={p.badges[i] ? 'trivia-pip on' : 'trivia-pip'}
            style={p.badges[i] ? { background: c.color } : undefined}
            title={`${c.name}: ${p.badges[i] ? 'badge earned' : `${p.catRight?.[i] ?? 0} of ${BADGE_AFTER} right so far`}`}
          />
        ))}
      </span>
    </li>
  );
}

/** Kelly's Basic Rules: open in the lobby, folded away during the game. */
function Rules({ open }: { open?: boolean }) {
  return (
    <details className="trivia-rules" open={open}>
      <summary>Basic rules of the game</summary>
      <ol>
        {TRIVIA_RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ol>
    </details>
  );
}

function Legend({ cats }: { cats: TriviaCategory[] }) {
  return (
    <div className="trivia-legend">
      <strong>Key to the colors</strong>
      <div>
        {cats.map((c) => (
          <span key={c.id}>
            <span className="trivia-swatch" style={{ background: c.color }} />
            {c.name}
          </span>
        ))}
      </div>
      <p className="trivia-hint">
        Each colored space is a question in that category. ↻ = spin again. In the Players list, the row of small circles
        on the right shows badges: empty until you answer {BADGE_AFTER} right in that category, then filled.
      </p>
    </div>
  );
}

function ScoreTable({ s, me, final }: { s: TriviaState; me: string; final?: boolean }) {
  const turnId = !final ? s.players[s.turn]?.id : undefined;
  const winners = final ? winnersOf(s) : [];
  return (
    <table className="trivia-scores">
      <thead>
        <tr>
          <th className="n">#</th>
          <th>Player</th>
          <th className="n">Score</th>
          <th className="n">Answered</th>
          <th className="n">Badges</th>
        </tr>
      </thead>
      <tbody>
        {scoreboard(s).map((r) => {
          const win = winners.includes(r.id);
          const cls = [r.id === me ? 'me' : '', win ? 'win' : ''].filter(Boolean).join(' ');
          return (
            <tr key={r.id} className={cls || undefined}>
              <td className="n">{r.rank}</td>
              <td>
                <span className="trivia-dot small" style={{ background: PLAYER_COLOURS[r.color] }} />
                {r.name}
                {r.id === me ? ' (you)' : ''}
                {win ? (winners.length > 1 ? ' ★ tied for the win' : ' ★ winner') : ''}
                {r.id === turnId ? ' ◀ turn' : ''}
                {r.away ? ' (away)' : ''}
              </td>
              <td className="n big">{r.score}</td>
              <td className="n">{r.asked}</td>
              <td className="n">
                {r.badges} of {r.badgesTotal}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const SCORE_HINT = `${POINTS_PER_RIGHT} points for every right answer, plus ${BADGE_BONUS} bonus points for each badge (${BADGE_AFTER} right answers in a category).`;

const clockText = (ms: number) => {
  const sec = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

export default function TriviaRoom({ sessionId, me }: { sessionId: string; me: string }) {
  const [view, setView] = useState<View | null>(null);
  const [cats, setCats] = useState<TriviaCategory[]>([]);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(0);
  const [msg, setMsg] = useState('');
  const [joinError, setJoinError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const timedOut = useRef(0);

  // A newer save replaces the game; a spin since the last one turns the wheel to the new number.
  const accept = useCallback((next: TriviaSnapshot) => {
    setView((v) => {
      if (v && !newer(v.snap, next)) return v;
      const spun = next.state.lastSpin;
      if (!v) return { snap: next, wheel: spun ? wheelAfter(0, spun) - 1080 : 0 };
      const turned = spun && next.state.spins !== v.snap.state.spins;
      return { snap: next, wheel: turned ? wheelAfter(v.wheel, spun) : v.wheel };
    });
  }, []);

  const took = useCallback(
    (data: ActResult) => {
      setOffset(data.now - Date.now());
      setCats(data.categories);
      accept(data);
    },
    [accept],
  );

  // Joining puts this person on the player list (or back from "away" after a reload).
  useEffect(() => {
    let live = true;
    void send(sessionId, { type: 'join' }).then((r) => {
      if (!live) return;
      if (r.error !== null) setJoinError(r.error);
      else took(r.data);
    });
    return () => {
      live = false;
    };
  }, [sessionId, attempt, took]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    const load = async () => {
      const { data } = await supabase
        .from('trivia_rooms')
        .select('state, card, rev')
        .eq('session_id', sessionId)
        .maybeSingle();
      if (data) accept(data as TriviaSnapshot);
    };
    const channel = supabase
      .channel(`trivia-${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trivia_rooms', filter: `session_id=eq.${sessionId}` },
        (change) => {
          const row = change.new as Partial<TriviaSnapshot>;
          if (row?.state && typeof row.rev === 'number')
            accept({ state: row.state, card: row.card ?? null, rev: row.rev });
        },
      )
      .subscribe();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_MS);
    return () => {
      void supabase.removeChannel(channel);
      window.clearInterval(timer);
    };
  }, [sessionId, accept]);

  const act = async (move: TriviaMove, quiet = false) => {
    if (!quiet) setBusy(true);
    const r = await send(sessionId, move);
    if (!quiet) setBusy(false);
    if (r.error !== null) {
      if (!quiet) setMsg(r.error);
      return;
    }
    setMsg('');
    took(r.data);
  };

  const onTick = useEffectEvent(() => {
    const t = Date.now();
    setNow(t);
    const s = view?.snap.state;
    if (!s || s.phase === 'lobby' || s.phase === 'over') return;
    // The step's deadline, or the end of the session if that comes first (the engine then ends the game).
    const due = s.endsAt && (!s.deadline || s.endsAt < s.deadline) ? s.endsAt : s.deadline;
    if (!due || timedOut.current === due) return;
    const mine = Math.max(
      0,
      s.players.findIndex((p) => p.id === me),
    );
    if (t + offset < due + TIMEOUT_GRACE_MS + mine * TIMEOUT_STAGGER_MS) return;
    timedOut.current = due;
    void act({ type: 'timeout' }, true);
  });

  useEffect(() => {
    const id = window.setInterval(onTick, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  if (joinError)
    return (
      <section className="trivia trivia-note" aria-label="Trivia game">
        <p className="section-label">Trivia, Trivier, Triviest</p>
        <h2>The game didn’t open.</h2>
        <p>{joinError}</p>
        <button
          className="trivia-btn primary"
          type="button"
          onClick={() => {
            setJoinError('');
            setAttempt((a) => a + 1);
          }}
        >
          Try again
        </button>
      </section>
    );
  if (!view)
    return (
      <section className="trivia trivia-note" aria-label="Trivia game">
        <p className="section-label">Trivia, Trivier, Triviest</p>
        <h2>Setting up the game…</h2>
      </section>
    );

  const { state: s, card } = view.snap;
  const roomCats = roomCategories(cats, s.themes);
  const serverNow = now + offset;
  const meIn = s.players.some((p) => p.id === me);
  const playing = s.phase === 'spin' || s.phase === 'move' || s.phase === 'question';
  const current = s.players[s.turn];
  const myTurn = playing && current?.id === me;
  const timer = s.players.find((p) => p.id === s.timekeeper);
  const amTimer = s.timekeeper === me;
  const clock = clockLeft(s, serverNow);
  const stepLeft = playing && s.phase !== 'question' ? Math.max(0, Math.ceil((s.deadline - serverNow) / 1000)) : null;
  const nameOf = (id: string | null) => s.players.find((p) => p.id === id)?.name ?? '';
  const winners = winnersOf(s).map(nameOf);
  const asked = s.q?.pauseReq ? nameOf(s.q.pauseReq) : '';
  const sessionLeft = playing && s.endsAt ? s.endsAt - serverNow : null;
  // Kelly 7 Nov: another player asks for a pause, then the Timer pauses the sand (never on the Timer's own question).
  const timerControls = (): ReactNode => {
    const stepDown = (
      <button
        className="trivia-btn quiet"
        type="button"
        disabled={busy}
        onClick={() => void act({ type: 'timer', on: false })}
      >
        Step down
      </button>
    );
    if (amTimer) {
      let note: ReactNode = (
        <span className="trivia-hint">You are the Timer. Pause requests appear with the next question.</span>
      );
      if (clock && myTurn) note = <span className="trivia-hint">You can’t pause the sand on your own question.</span>;
      else if (clock && !clock.running)
        note = (
          <button
            className="trivia-btn primary"
            type="button"
            disabled={busy}
            onClick={() => void act({ type: 'clock', run: true })}
          >
            Restart the sand
          </button>
        );
      else if (clock && asked)
        note = (
          <>
            <span className="trivia-hint">{asked} asked for a pause.</span>
            <button
              className="trivia-btn primary"
              type="button"
              disabled={busy}
              onClick={() => void act({ type: 'clock', run: false })}
            >
              Pause the sand
            </button>
          </>
        );
      else if (clock) note = <span className="trivia-hint">If a player asks for a pause, a button appears here.</span>;
      return (
        <>
          {note}
          {stepDown}
        </>
      );
    }
    if (!timer || timer.away)
      return meIn ? (
        <button
          className="trivia-btn"
          type="button"
          disabled={busy}
          onClick={() => void act({ type: 'timer', on: true })}
        >
          I’ll be the Timer
        </button>
      ) : null;
    if (clock && !clock.running) return <span className="trivia-hint">Paused by the Timer.</span>;
    if (!clock || timer.id === current?.id) return null;
    if (asked) return <span className="trivia-hint">Pause requested. Waiting for {timer.name}.</span>;
    return meIn ? (
      <button className="trivia-btn" type="button" disabled={busy} onClick={() => void act({ type: 'pause' })}>
        Ask for a pause
      </button>
    ) : null;
  };
  const rows = () => (
    <ul className="trivia-players">
      {s.players.map((p, k) => (
        <PlayerRow key={p.id} p={p} k={k} s={s} cats={roomCats} me={me} />
      ))}
    </ul>
  );

  return (
    <section className="trivia" aria-label="Trivia game">
      <header className="trivia-head">
        <div>
          <p className="section-label">Trivia, Trivier, Triviest</p>
          <h2>
            {s.phase === 'lobby'
              ? 'Waiting to start'
              : s.phase === 'over'
                ? winners.length > 1
                  ? `${winners.join(' and ')} tie for the win`
                  : winners.length
                    ? `${winners[0]} wins`
                    : 'Game over'
                : myTurn
                  ? 'Your turn'
                  : `${current?.name ?? ''}’s turn`}
          </h2>
        </div>
        <span>
          {s.players.length} of {MAX_PLAYERS} players
          {s.themes.length > 0 && ` · Theme: ${roomCats.map((c) => c.name).join(', ')}`}
        </span>
      </header>

      {!meIn && (
        <div className="trivia-panel">
          <p>You’re watching. Join to play from the next turn.</p>
          <button
            className="trivia-btn primary"
            type="button"
            disabled={busy}
            onClick={() => void act({ type: 'join' })}
          >
            Join the game
          </button>
        </div>
      )}

      {s.phase === 'lobby' && (
        <div className="trivia-panel trivia-lobby">
          {rows()}
          <div>
            <p className="trivia-hint">
              Theme night: tick the categories to play with, or leave them all unticked to play with every category.
            </p>
            <div className="trivia-actions">
              {cats.map((c) => (
                <label className="trivia-check" key={c.id}>
                  <input
                    type="checkbox"
                    checked={s.themes.includes(c.id)}
                    disabled={busy || !meIn}
                    onChange={(e) =>
                      void act({
                        type: 'theme',
                        cats: e.target.checked ? [...s.themes, c.id] : s.themes.filter((id) => id !== c.id),
                      })
                    }
                  />
                  <span className="trivia-swatch" style={{ background: c.color }} />
                  {c.name}
                </label>
              ))}
            </div>
            <div className="trivia-actions">
              <button
                className="trivia-btn"
                type="button"
                disabled={busy || !meIn}
                onClick={() => void act({ type: 'theme', cats: [] })}
              >
                All categories
              </button>
              <button
                className="trivia-btn"
                type="button"
                disabled={busy || !meIn}
                onClick={() =>
                  void act({ type: 'theme', random: Math.min(RANDOM_THEME, Math.max(1, cats.length - 1)) })
                }
              >
                Surprise me ({RANDOM_THEME} at random)
              </button>
            </div>
          </div>
          <div>
            <p className="trivia-hint">
              The Timer works the hourglass and can pause the sand when another player asks. Anyone can volunteer.
            </p>
            <div className="trivia-actions">
              <span>{timer ? `Timer: ${timer.name}` : 'No Timer yet.'}</span>
              {amTimer ? (
                <button
                  className="trivia-btn quiet"
                  type="button"
                  disabled={busy}
                  onClick={() => void act({ type: 'timer', on: false })}
                >
                  Step down
                </button>
              ) : (
                <button
                  className="trivia-btn"
                  type="button"
                  disabled={busy || !meIn || (Boolean(timer) && !timer?.away)}
                  onClick={() => void act({ type: 'timer', on: true })}
                >
                  I’ll be the Timer
                </button>
              )}
            </div>
          </div>
          <Rules open />
          <div className="trivia-actions">
            <button
              className="trivia-btn primary big"
              type="button"
              disabled={busy || !meIn || s.players.length < 2}
              onClick={() => void act({ type: 'start' })}
            >
              Start the game
            </button>
            {s.players.length < 2 && <span className="trivia-hint">You need at least 2 players.</span>}
          </div>
        </div>
      )}

      {playing && (
        <div className="trivia-play">
          <div className="trivia-board-col">
            <div className="trivia-panel trivia-board-box">
              <Board
                s={s}
                cats={roomCats}
                wheel={view.wheel}
                myTurn={myTurn && !busy}
                onMove={(to) => void act({ type: 'move', to })}
              />
              <Legend cats={roomCats} />
            </div>
            <div className="trivia-panel">
              <h3>What’s happening</h3>
              <ol className="trivia-log">
                {s.log
                  .slice(-LOG_LINES)
                  .reverse()
                  .map((line, i) => (
                    <li key={`${s.log.length - i}-${line}`}>{line}</li>
                  ))}
              </ol>
              <Rules />
            </div>
          </div>

          <div className="trivia-side">
            <div className={myTurn ? 'trivia-turn me' : 'trivia-turn'}>
              {myTurn ? 'Your turn' : `${current?.name ?? ''}’s turn`}
              {stepLeft !== null && <span> · {stepLeft} s</span>}
            </div>

            {s.last && (
              <div className={`trivia-result ${s.last.ok ? 'ok' : 'no'}`} role="status">
                <strong>
                  {s.last.player}
                  {s.last.ok ? ' got it right.' : s.last.timedOut ? ' ran out of time.' : ' got it wrong.'}
                </strong>{' '}
                {!s.last.ok && (
                  <>
                    The answer was <strong>{s.last.correct}</strong>.{' '}
                  </>
                )}
                {s.last.note}
              </div>
            )}

            <div className="trivia-panel">
              {s.phase === 'spin' &&
                (myTurn ? (
                  <>
                    <button
                      className="trivia-btn primary big"
                      type="button"
                      disabled={busy}
                      onClick={() => void act({ type: 'spin' })}
                    >
                      Spin the spinner
                    </button>
                    <p className="trivia-hint">You have {ACTION_SECONDS} seconds.</p>
                  </>
                ) : (
                  <p>Waiting for {current?.name} to spin.</p>
                ))}
              {s.phase === 'move' &&
                (myTurn ? (
                  <>
                    <p>
                      <strong>You spun a {s.spin}.</strong> Choose where to go: tap a flashing space on the board, or
                      use these.
                    </p>
                    <div className="trivia-actions">
                      {s.options.map((to, k) => (
                        <button
                          className="trivia-btn primary"
                          type="button"
                          key={to}
                          disabled={busy}
                          onClick={() => void act({ type: 'move', to })}
                        >
                          {k === 0 ? 'Clockwise' : 'Counter-clockwise'} to space {to + 1}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p>
                    {current?.name} spun a {s.spin} and is choosing where to move.
                  </p>
                ))}
              {s.phase === 'question' && card && (
                <div className="trivia-card">
                  <div className="trivia-band" style={{ background: card.color, color: inkOn(card.color) }}>
                    {card.catName}
                  </div>
                  <div className="trivia-card-body">
                    <p className="trivia-q">{card.q}</p>
                    <div className="trivia-choices">
                      {card.choices.map((text, k) => (
                        <button
                          className="trivia-choice"
                          type="button"
                          key={`${k}-${text}`}
                          disabled={!myTurn || busy}
                          onClick={() => void act({ type: 'answer', choice: k })}
                        >
                          <span className="trivia-key">{'ABCDEF'[k]}</span>
                          <span>{text}</span>
                        </button>
                      ))}
                    </div>
                    {!myTurn && <p className="trivia-hint">{current?.name} is answering.</p>}
                  </div>
                </div>
              )}
            </div>

            <div className="trivia-panel trivia-timer">
              <Hourglass f={clock ? clock.left / clock.total : 1} running={Boolean(clock?.running)} />
              <div>
                <p>
                  <span className="trivia-secs">{clock ? Math.ceil(clock.left / 1000) : 60}</span>{' '}
                  <span className="trivia-hint">seconds left{timer ? ` · Timer: ${timer.name}` : ''}</span>
                </p>
                <p className="trivia-hint">
                  {!clock
                    ? 'Waiting for the next question.'
                    : clock.running
                      ? 'The sand is running.'
                      : `The sand is paused. Paused time left: ${Math.ceil(clock.pauseLeft / 1000)} s, then it runs again.`}
                </p>
                <div className="trivia-actions">{timerControls()}</div>
                {sessionLeft !== null && <p className="trivia-hint">Session ends in {clockText(sessionLeft)}</p>}
              </div>
            </div>

            <div className="trivia-panel">
              <h3>Players</h3>
              {rows()}
            </div>
            <div className="trivia-panel">
              <h3>Scoreboard</h3>
              <ScoreTable s={s} me={me} />
              <p className="trivia-hint">
                {SCORE_HINT} Highest score wins at the end of the session. Updates after every question.
              </p>
            </div>
          </div>
        </div>
      )}

      {s.phase === 'over' && (
        <div className="trivia-panel">
          <ScoreTable s={s} me={me} final />
          <p className="trivia-hint">
            {SCORE_HINT} The highest score wins. Players tied on the top score win together.
          </p>
          <div className="trivia-actions">
            <button
              className="trivia-btn primary"
              type="button"
              disabled={busy || !meIn}
              onClick={() => void act({ type: 'again' })}
            >
              Play again with the same players
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p className="trivia-msg" role="alert">
          {msg}
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {s.log.at(-1) ?? ''}
      </p>
    </section>
  );
}
