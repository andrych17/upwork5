'use client';

// Slow Chess in the board's look. This file holds the board and the games against the computer: the game lives
// in the link (#g=…&ai=<level>) and in localStorage on this device. Games with a buddy are saved in the
// database and live in buddy-chess.tsx. The store below is the only place that changes a computer game; the
// screen reads its snapshot, so opening a link works like tapping Open.
import { useState, useSyncExternalStore } from 'react';
import BuddyPicker from '@/components/games/buddy-picker';
import { bestMove } from '@/lib/slow-chess/computer';
import {
  AI_LEVELS,
  cleanName,
  colorOf,
  gameHash,
  kingSq,
  newId,
  parseGameHash,
  replay,
  sqName,
  uci,
  type AiLevel,
  type GameRef,
  type Move,
  type Replay,
} from '@/lib/slow-chess/engine';

const KEY = 'meetdoconnect.slowchess.games';
const THINK_MS = 450;
const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const NAME: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
export const PROMO = [
  ['q', 'Queen'],
  ['r', 'Rook'],
  ['b', 'Bishop'],
  ['n', 'Knight'],
] as const;
const LEVEL_NAME: Record<AiLevel, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const START = replay([]) as Replay;
// U+FE0E asks for the plain text glyph, not an emoji.
export const glyph = (p: string) => `${GLYPH[p.toLowerCase()]}︎`;
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

type Game = GameRef;
interface Listed {
  id: string;
  title: string;
  status: string;
}
interface Snap {
  game: Game | null;
  r: Replay | null;
  sel: number;
  flipped: boolean;
  promo: Move[] | null;
  thinking: boolean;
  list: Listed[];
  error: string;
}

/* ---------- saved games ---------- */
type SavedGames = Record<string, { id: string; w: string; b: string; t: string; u: number; ai?: string }>;
function readAll(): SavedGames {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown;
    return all && typeof all === 'object' ? (all as SavedGames) : {};
  } catch {
    return {};
  }
}
function writeAll(all: SavedGames) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage blocked: the link still holds the game */
  }
}
const tokensOf = (t: unknown) => (typeof t === 'string' ? t.split('.').filter(Boolean) : []);
const levelOf = (x: unknown) => AI_LEVELS.find((level) => level === x);
function refOf(g: SavedGames[string]): GameRef {
  const ai = levelOf(g.ai);
  return {
    id: g.id,
    w: cleanName(g.w, 'White'),
    b: cleanName(g.b, 'Black'),
    tokens: tokensOf(g.t),
    ...(ai ? { ai } : {}),
  };
}
function listGames(): Listed[] {
  return Object.values(readAll())
    .filter((g) => g && typeof g.id === 'string')
    .sort((a, b) => b.u - a.u)
    .slice(0, 20)
    .flatMap((saved) => {
      const g = refOf(saved);
      const r = replay(g.tokens);
      if ('error' in r) return [];
      const status = r.over
        ? r.over === 'd'
          ? 'Draw'
          : `${r.over === 'w' ? g.w : g.b} won`
        : `${r.state.turn === 'w' ? g.w : g.b} to move`;
      const title = g.ai ? `You vs the computer (${LEVEL_NAME[g.ai]})` : `${g.w} vs ${g.b}`;
      return [{ id: g.id, title, status: `${status} · ${r.sans.length} moves` }];
    });
}

/* ---------- the store ---------- */
let snap: Snap | null = null;
const SERVER: Snap = {
  game: null,
  r: null,
  sel: -1,
  flipped: false,
  promo: null,
  thinking: false,
  list: [],
  error: '',
};
const listeners = new Set<() => void>();
const getSnap = () => (snap ??= { ...SERVER, list: listGames() });
function set(patch: Partial<Snap>) {
  snap = { ...getSnap(), ...patch };
  for (const l of listeners) l();
}
function keepHash(g: GameRef | null) {
  try {
    history.replaceState(null, '', g ? gameHash(g) : location.pathname + location.search);
  } catch {
    /* some embedded browsers block this; the share box still has the link */
  }
}
function saveGame(g: Game) {
  const entry = { id: g.id, w: g.w, b: g.b, t: g.tokens.join('.'), u: Date.now(), ...(g.ai ? { ai: g.ai } : {}) };
  writeAll({ ...readAll(), [g.id]: entry });
}

const computerToMove = (g: Game, r: Replay) => !!g.ai && !r.over && r.state.turn === 'b';

function show(game: Game, r: Replay, patch: Partial<Snap> = {}) {
  saveGame(game);
  const thinking = computerToMove(game, r);
  set({ game, r, sel: -1, promo: null, error: '', thinking, ...patch });
  keepHash(game);
  if (thinking) window.setTimeout(() => computerReply(game), THINK_MS);
}
function computerReply(game: Game) {
  const now = getSnap();
  if (now.game !== game || !now.r || !game.ai) return; // undone, resigned or closed in the meantime
  const m = bestMove(now.r.state, game.ai);
  if (m) update({ ...game, tokens: [...game.tokens, uci(m)] });
}
function open(g: GameRef) {
  const r = replay(g.tokens);
  if ('error' in r) return set({ error: r.error });
  show({ ...g, tokens: [...g.tokens] }, r);
}
function update(game: Game) {
  const r = replay(game.tokens);
  if (!('error' in r)) show(game, r);
}
function undo(game: Game, r: Replay) {
  // Take back the computer's reply too, so it is your turn again.
  const back = game.tokens.at(-1) === 'r' || r.state.turn === 'b' ? 1 : 2;
  update({ ...game, tokens: game.tokens.slice(0, Math.max(0, game.tokens.length - back)) });
}
function closeGame() {
  keepHash(null);
  set({ game: null, r: null, thinking: false, list: listGames() });
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const fromHash = () => {
    const g = parseGameHash(location.hash);
    if (!g?.ai) return; // links from the old buddy-by-link flow are not games any more
    open(g);
    requestAnimationFrame(() => document.getElementById('slow-chess')?.scrollIntoView({ block: 'start' }));
  };
  if (listeners.size === 1) fromHash();
  window.addEventListener('hashchange', fromHash);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('hashchange', fromHash);
  };
}

/* ---------- screen ---------- */
export function Board({
  r,
  flipped = false,
  sel = -1,
  onTap,
}: {
  r: Replay;
  flipped?: boolean;
  sel?: number;
  onTap?: (i: number) => void;
}) {
  const st = r.state;
  const last = r.hist.at(-1);
  const checked = r.check ? kingSq(st, st.turn) : -1;
  const targets = new Map(r.legal.filter((m) => m.from === sel).map((m) => [m.to, !!st.b[m.to] || m.flag === 'ep']));
  const squares = [];
  for (let vr = 0; vr < 8; vr++) {
    for (let vc = 0; vc < 8; vc++) {
      const row = flipped ? 7 - vr : vr;
      const col = flipped ? 7 - vc : vc;
      const i = row * 8 + col;
      const p = st.b[i] ?? '';
      const target = targets.get(i);
      const className = [
        (row + col) % 2 ? 'dark' : 'light',
        i === sel && 'sq-selected',
        last && (last.from === i || last.to === i) && 'sq-last',
        i === checked && 'sq-check',
      ]
        .filter(Boolean)
        .join(' ');
      const content = (
        <>
          {p && (
            <span className={colorOf(p) === 'w' ? 'white-piece' : 'black-piece'} aria-hidden="true">
              {glyph(p)}
            </span>
          )}
          {target === false && <span className="sq-dot" aria-hidden="true" />}
          {target === true && <span className="sq-ring" aria-hidden="true" />}
          {vc === 0 && (
            <span className="sq-rank" aria-hidden="true">
              {8 - row}
            </span>
          )}
          {vr === 7 && (
            <span className="sq-file" aria-hidden="true">
              {'abcdefgh'.charAt(col)}
            </span>
          )}
        </>
      );
      const label = `${p ? `${colorOf(p) === 'w' ? 'White' : 'Black'} ${NAME[p.toLowerCase()]} on ${sqName(i)}` : `Empty ${sqName(i)}`}${
        target === undefined ? '' : ', legal move'
      }`;
      squares.push(
        onTap ? (
          <button className={className} type="button" aria-label={label} key={i} onClick={() => onTap(i)}>
            {content}
          </button>
        ) : (
          <span className={className} key={i}>
            {content}
          </span>
        ),
      );
    }
  }
  return onTap ? (
    <div className="chess-board" role="group" aria-label="Chess board">
      {squares}
    </div>
  ) : (
    <div className="chess-board" role="img" aria-label="Chess board in the starting position">
      {squares}
    </div>
  );
}

function Setup({ list, error }: { list: Listed[]; error: string }) {
  const [opponent, setOpponent] = useState<'computer' | 'buddy'>('computer');
  const [level, setLevel] = useState<AiLevel>('medium');

  function start() {
    open({ id: newId(), w: 'You', b: 'Computer', tokens: [], ai: level });
  }
  function remove(id: string) {
    if (!confirm('Delete this game from this device?')) return;
    const all = readAll();
    delete all[id];
    writeAll(all);
    set({ list: listGames() });
  }
  function openSaved(id: string) {
    const g = readAll()[id];
    if (g) open(refOf(g));
  }

  return (
    <section className="chess-game" id="slow-chess">
      <div className="chess-copy">
        <p className="section-label">Slow Chess</p>
        <h2>Play the computer or a buddy.</h2>
        <p>
          Against the computer, it answers in a moment. With a buddy, you make a move and press Play. They answer
          whenever they return, and you can have a game going with each buddy. Every rule is in: castling, en passant,
          promotion, check, checkmate and draws.
        </p>
        <div className="word-mode-switch" role="group" aria-label="Who you play">
          <button
            className={opponent === 'computer' ? 'selected' : ''}
            type="button"
            aria-pressed={opponent === 'computer'}
            onClick={() => setOpponent('computer')}
          >
            Vs computer
          </button>
          <button
            className={opponent === 'buddy' ? 'selected' : ''}
            type="button"
            aria-pressed={opponent === 'buddy'}
            onClick={() => setOpponent('buddy')}
          >
            With a buddy
          </button>
        </div>
        {opponent === 'computer' ? (
          <div className="game-settings">
            <label>
              Skill level
              <select value={level} onChange={(event) => setLevel(event.target.value as AiLevel)}>
                {AI_LEVELS.map((value) => (
                  <option value={value} key={value}>
                    {LEVEL_NAME[value]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <BuddyPicker game="Slow Chess" />
        )}
        {error && <p className="chess-error">{error}</p>}
        {list.length > 0 && (
          <div className="chess-saved">
            <h3>Your games against the computer on this device</h3>
            {list.map((g) => (
              <div key={g.id}>
                <div>
                  <strong>{g.title}</strong>
                  <span>{g.status}</span>
                </div>
                <button type="button" onClick={() => openSaved(g.id)}>
                  Open
                </button>
                <button type="button" onClick={() => remove(g.id)}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="chess-board-wrap">
        <Board r={START} />
        {opponent === 'computer' && (
          <>
            <button className="send-move" type="button" onClick={start}>
              Start a game vs the computer ({LEVEL_NAME[level]}) <span aria-hidden="true">→</span>
            </button>
            <p className="chess-note">You play White and move first.</p>
          </>
        )}
      </div>
    </section>
  );
}

export default function SlowChess() {
  const s = useSyncExternalStore(subscribe, getSnap, () => SERVER);
  const { game, r } = s;
  if (!game || !r || !game.ai) return <Setup list={s.list} error={s.error} />;

  const st = r.state;
  const level = game.ai;
  const canMove = !r.over && !s.thinking && !s.promo;
  const canUndo = !s.thinking && game.tokens.length > 0;
  const pairs = Array.from({ length: Math.ceil(r.sans.length / 2) }, (_, k) => r.sans.slice(k * 2, k * 2 + 2));

  let status: { title: string; text: string };
  if (r.over)
    status = {
      title: r.over === 'd' ? 'Draw' : r.over === 'w' ? 'You win' : 'The computer wins',
      text: `${r.why}.`,
    };
  else if (s.thinking) status = { title: 'The computer is thinking…', text: 'It plays Black.' };
  else status = { title: r.check ? 'Check. Your move' : 'Your move', text: 'Tap a piece, then tap where it goes.' };

  function tap(i: number) {
    if (!game || !r || !canMove) return;
    if (s.sel >= 0) {
      const cands = r.legal.filter((m) => m.from === s.sel && m.to === i);
      if (cands[0]?.promo) return set({ promo: cands });
      if (cands[0]) return update({ ...game, tokens: [...game.tokens, uci(cands[0])] });
    }
    const p = st.b[i];
    set({ sel: p && colorOf(p) === st.turn && s.sel !== i ? i : -1 });
  }

  return (
    <section className="chess-game" id="slow-chess">
      <div className="chess-copy">
        <p className="section-label">Slow Chess</p>
        <h2>You against the computer.</h2>
        <div className="chess-players">
          {(['w', 'b'] as const).map((color) => (
            <div className={`chess-opponent ${!r.over && st.turn === color ? 'chess-to-move' : ''}`} key={color}>
              <div className={`opponent-mark ${color === 'w' ? 'mark-white' : ''}`}>
                {color === 'w' ? 'You' : 'CPU'}
              </div>
              <div>
                <strong>{color === 'w' ? game.w : `Computer · ${LEVEL_NAME[level]}`}</strong>
                <span>{color === 'w' ? 'White' : 'Black'}</span>
              </div>
            </div>
          ))}
        </div>
        <div className={`move-status ${r.check || r.over ? 'move-status-alert' : ''}`} role="status" aria-live="polite">
          <strong>{status.title}</strong>
          <span>{status.text}</span>
        </div>
        <div className="chess-actions">
          <button type="button" disabled={!canUndo} onClick={() => undo(game, r)}>
            Take back
          </button>
          <button type="button" onClick={() => set({ flipped: !s.flipped })}>
            Flip board
          </button>
          <button
            type="button"
            disabled={!!r.over || s.thinking}
            onClick={() => confirm('Resign this game?') && update({ ...game, tokens: [...game.tokens, 'r'] })}
          >
            Resign
          </button>
          <button type="button" onClick={closeGame}>
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
        <Board r={r} flipped={s.flipped} sel={s.sel} onTap={tap} />
        {s.promo && (
          <div className="chess-promo" role="group" aria-label="Promote to">
            <span>Promote to</span>
            {PROMO.map(([x, name]) => {
              const m = s.promo?.find((c) => c.promo === x);
              return (
                <button
                  type="button"
                  aria-label={name}
                  key={x}
                  onClick={() => m && update({ ...game, tokens: [...game.tokens, uci(m)] })}
                >
                  {glyph(st.turn === 'w' ? x.toUpperCase() : x)}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
