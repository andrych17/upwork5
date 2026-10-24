'use client';

// Slow Chess screen, ported from chess.html. The game lives in the link, and games on this device are
// also kept in localStorage. The store below is the only place that changes the game; the screen reads its
// snapshot, so opening a link (on load or on hashchange) works the same as tapping Open.
import { useState, useSyncExternalStore } from 'react';
import {
  colorOf,
  gameHash,
  kingSq,
  newId,
  parseGameHash,
  replay,
  sqName,
  uci,
  cleanName,
  type GameRef,
  type Move,
  type Replay,
} from '@/lib/slow-chess/engine';
import { Button, Shell, cn } from './ui';

const KEY = 'meetdoconnect.slowchess.games';
const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const NAME: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const PROMO = [
  ['q', 'Queen'],
  ['r', 'Rook'],
  ['b', 'Bishop'],
  ['n', 'Knight'],
] as const;
const FIELD = 'min-h-11 w-[16ch] max-w-full min-w-0 rounded-2xl border border-line-strong bg-bg px-3.5 py-2';
const LABEL = 'text-[0.82rem] font-bold text-muted';
// U+FE0E asks for the plain text glyph, not an emoji.
const glyph = (p: string) => `${GLYPH[p.toLowerCase()]}︎`;

interface Game extends GameRef {
  /** moves that came in with the link; only later moves can be undone */
  loadedLen: number;
}
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
  list: Listed[];
  error: string;
}

/* ---------- saved games ---------- */
type SavedGames = Record<string, { id: string; w: string; b: string; t: string; u: number }>;
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
function listGames(): Listed[] {
  const all = readAll();
  return Object.values(all)
    .filter((g) => g && typeof g.id === 'string')
    .sort((a, b) => b.u - a.u)
    .slice(0, 20)
    .flatMap((g) => {
      const w = cleanName(g.w, 'White');
      const b = cleanName(g.b, 'Black');
      const r = replay(tokensOf(g.t));
      if ('error' in r) return [];
      const status = r.over
        ? r.over === 'd'
          ? 'Draw'
          : `${r.over === 'w' ? w : b} won`
        : `${r.state.turn === 'w' ? w : b} to move`;
      return [{ id: g.id, title: `${w} vs ${b}`, status: `${status} · ${r.sans.length} moves` }];
    });
}

/* ---------- the store ---------- */
let snap: Snap | null = null;
const SERVER: Snap = { game: null, r: null, sel: -1, flipped: false, promo: null, list: [], error: '' };
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
  writeAll({ ...readAll(), [g.id]: { id: g.id, w: g.w, b: g.b, t: g.tokens.join('.'), u: Date.now() } });
}

function open(g: GameRef) {
  const r = replay(g.tokens);
  if ('error' in r) return set({ error: r.error });
  const game = { ...g, tokens: [...g.tokens], loadedLen: g.tokens.length };
  saveGame(game);
  set({ game, r, sel: -1, promo: null, flipped: !r.over && r.state.turn === 'b', error: '' });
  keepHash(game);
  window.scrollTo(0, 0);
}
function update(game: Game) {
  const r = replay(game.tokens);
  if ('error' in r) return;
  saveGame(game);
  set({ game, r, sel: -1, promo: null, error: '' });
  keepHash(game);
}
const play = (game: Game, m: Move) => update({ ...game, tokens: [...game.tokens, uci(m)] });

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const fromHash = () => {
    const g = parseGameHash(location.hash);
    if (g) open(g);
  };
  if (listeners.size === 1) fromHash();
  window.addEventListener('hashchange', fromHash);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('hashchange', fromHash);
  };
}

/* ---------- screen ---------- */
function Setup({ list, error }: { list: Listed[]; error: string }) {
  const [w, setW] = useState('');
  const [b, setB] = useState('');
  function remove(id: string) {
    if (!confirm('Delete this game from this device?')) return;
    const all = readAll();
    delete all[id];
    writeAll(all);
    set({ list: listGames() });
  }
  function openSaved(id: string) {
    const g = readAll()[id];
    if (g) open({ id: g.id, w: cleanName(g.w, 'White'), b: cleanName(g.b, 'Black'), tokens: tokensOf(g.t) });
  }
  return (
    <Shell as="section" aria-label="New game">
      <h2 className="text-[1.6rem]">Start a game</h2>
      <div className="flex flex-wrap items-end gap-2.5">
        <div className="grid min-w-0 gap-1.5">
          <label htmlFor="nameW" className={LABEL}>
            White player
          </label>
          <input
            id="nameW"
            type="text"
            maxLength={20}
            autoComplete="off"
            placeholder="You"
            value={w}
            onChange={(e) => setW(e.target.value)}
            className={FIELD}
          />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <label htmlFor="nameB" className={LABEL}>
            Black player
          </label>
          <input
            id="nameB"
            type="text"
            maxLength={20}
            autoComplete="off"
            placeholder="Your friend"
            value={b}
            onChange={(e) => setB(e.target.value)}
            className={FIELD}
          />
        </div>
      </div>
      <div>
        <Button
          variant="primary"
          size="lg"
          arrow="→"
          onClick={() => open({ id: newId(), w: cleanName(w, 'White'), b: cleanName(b, 'Black'), tokens: [] })}
        >
          Start game
        </Button>
      </div>
      <p className="text-[0.86rem] text-muted">
        White moves first. After you move, you will get a link to send to your opponent by text, email or chat.
      </p>
      {error && <p className="font-semibold text-bad">{error}</p>}
      {list.length > 0 && (
        <div className="grid gap-2 pt-2">
          <h3 className="text-[1.1rem]">Your games on this device</h3>
          {list.map((g) => (
            <div
              key={g.id}
              className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl bg-bg px-3.5 py-2.5 ring-1 ring-line"
            >
              <div>
                <strong>{g.title}</strong>
                <small className="block text-muted">{g.status}</small>
              </div>
              <div className="flex gap-1.5">
                <Button variant="primary" onClick={() => openSaved(g.id)}>
                  Open
                </Button>
                <Button variant="quiet" onClick={() => remove(g.id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}

function Player({ name, color, turn }: { name: string; color: 'w' | 'b'; turn: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-full px-3.5 py-1.5 font-bold ring-1 ring-line',
        turn && 'bg-accent-soft ring-accent',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-3.5 rounded-full border-2 border-fg', color === 'w' ? 'bg-white' : 'bg-[#14231e]')}
      />
      {name}
      <span className="sr-only">({color === 'w' ? 'White' : 'Black'})</span>
    </div>
  );
}

export default function SlowChess() {
  const s = useSyncExternalStore(subscribe, getSnap, () => SERVER);
  const [copyMsg, setCopyMsg] = useState('');
  const { game, r } = s;
  if (!game || !r) return <Setup list={s.list} error={s.error} />;

  const st = r.state;
  const last = r.hist.at(-1);
  const ksq = r.check ? kingSq(st, st.turn) : -1;
  const targets = new Map(r.legal.filter((m) => m.from === s.sel).map((m) => [m.to, !!st.b[m.to] || m.flag === 'ep']));
  const mover = st.turn === 'w' ? game.w : game.b;
  const status = r.over
    ? `${r.why}. ${r.over === 'd' ? 'Draw.' : `${r.over === 'w' ? game.w : game.b} wins.`}`
    : `${r.check ? 'Check! ' : ''}${mover} to move (${st.turn === 'w' ? 'White' : 'Black'}).`;
  const moved = game.tokens.length > game.loadedLen;
  const link = location.href.split('#')[0] + gameHash(game);
  const canShare = typeof navigator.share === 'function';
  const pairs = Array.from({ length: Math.ceil(r.sans.length / 2) }, (_, k) => r.sans.slice(k * 2, k * 2 + 2));

  function tap(i: number) {
    if (!game || !r || r.over || s.promo) return;
    if (s.sel >= 0) {
      const cands = r.legal.filter((m) => m.from === s.sel && m.to === i);
      if (cands[0]?.promo) return set({ promo: cands });
      if (cands[0]) return play(game, cands[0]);
    }
    const p = st.b[i];
    set({ sel: p && colorOf(p) === st.turn && s.sel !== i ? i : -1 });
  }
  function copyLink() {
    const fail = () => setCopyMsg('Select the text and copy it.');
    if (!navigator.clipboard) return fail();
    navigator.clipboard.writeText(link).then(() => setCopyMsg('Copied.'), fail);
  }

  const squares = [];
  for (let vr = 0; vr < 8; vr++) {
    for (let vc = 0; vc < 8; vc++) {
      const row = s.flipped ? 7 - vr : vr;
      const col = s.flipped ? 7 - vc : vc;
      const i = row * 8 + col;
      const p = st.b[i] ?? '';
      const target = targets.get(i);
      const label = p
        ? `${colorOf(p) === 'w' ? 'White' : 'Black'} ${NAME[p.toLowerCase()]} on ${sqName(i)}`
        : `Empty ${sqName(i)}`;
      squares.push(
        <button
          key={i}
          type="button"
          aria-label={label}
          onClick={() => tap(i)}
          className={cn(
            'relative grid aspect-square place-items-center p-0 text-[9cqw] leading-none',
            (row + col) % 2 ? 'bg-[#86a893] dark:bg-[#4c6f5d]' : 'bg-[#ecefe2] dark:bg-[#b9c4b2]',
            i === s.sel && 'shadow-[inset_0_0_0_4px_var(--sun)]',
          )}
        >
          {last && (last.from === i || last.to === i) && <span className="absolute inset-0 bg-sun/55" />}
          {i === ksq && (
            <span className="absolute inset-0 bg-[radial-gradient(circle,rgb(200_40_20/0.85)_0%,transparent_75%)]" />
          )}
          {p && (
            <span
              className={cn(
                "pointer-events-none relative font-['Segoe_UI_Symbol','Noto_Sans_Symbols_2','DejaVu_Sans','Apple_Symbols',sans-serif]",
                colorOf(p) === 'w'
                  ? 'text-white [-webkit-text-stroke:1.5px_#14231e] [text-shadow:0_1px_1px_rgb(0_0_0/0.35)]'
                  : 'text-[#14231e] [text-shadow:0_1px_0_rgb(255_255_255/0.25)] dark:text-[#0b1411]',
              )}
            >
              {glyph(p)}
            </span>
          )}
          {target === false && <span className="absolute size-[28%] rounded-full bg-accent/55" />}
          {target === true && <span className="absolute size-[86%] rounded-full border-4 border-accent/55" />}
          {vc === 0 && (
            <span className="absolute top-px left-[3px] font-sans text-[10px] font-bold text-[#14231e]/60">
              {8 - row}
            </span>
          )}
          {vr === 7 && (
            <span className="absolute right-[3px] bottom-px font-sans text-[10px] font-bold text-[#14231e]/60">
              {'abcdefgh'.charAt(col)}
            </span>
          )}
        </button>,
      );
    }
  }

  return (
    <Shell as="section" aria-label="Game" coreClassName="gap-4">
      <div className="flex flex-wrap justify-between gap-2.5">
        <Player name={game.w} color="w" turn={!r.over && st.turn === 'w'} />
        <Player name={game.b} color="b" turn={!r.over && st.turn === 'b'} />
      </div>
      <div
        role="group"
        aria-label="Chess board"
        className="@container mx-auto grid w-full max-w-[656px] touch-manipulation grid-cols-8 overflow-hidden rounded-md border-2 border-fg"
      >
        {squares}
      </div>
      <p role="status" aria-live="polite" className={cn('min-h-[1.5em] font-bold', r.check && 'text-bad')}>
        {status}
      </p>
      {s.error && <p className="font-semibold text-bad">{s.error}</p>}
      {s.promo && (
        <div className="flex flex-wrap items-center gap-2">
          <span>Promote to:</span>
          {PROMO.map(([x, name]) => {
            const m = s.promo?.find((c) => c.promo === x);
            return (
              <Button key={x} aria-label={name} className="px-3.5 text-[1.8rem]" onClick={() => m && play(game, m)}>
                {glyph(st.turn === 'w' ? x.toUpperCase() : x)}
              </Button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!moved} onClick={() => moved && update({ ...game, tokens: game.tokens.slice(0, -1) })}>
          Undo my move
        </Button>
        <Button onClick={() => set({ flipped: !s.flipped })}>Flip board</Button>
        <Button
          variant="quiet"
          disabled={!!r.over}
          onClick={() => !r.over && confirm('Resign this game?') && update({ ...game, tokens: [...game.tokens, 'r'] })}
        >
          Resign
        </Button>
        <Button
          variant="quiet"
          onClick={() => {
            keepHash(null);
            set({ game: null, r: null, list: listGames() });
          }}
        >
          All games
        </Button>
      </div>
      {(moved || r.over || game.tokens.length > 0) && (
        <div className="grid gap-2 rounded-2xl bg-accent-soft p-3.5">
          <label htmlFor="link" className="font-bold">
            {r.over ? 'Send the finished game' : `Send this link to ${mover}`}
          </label>
          <textarea
            id="link"
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
            className="min-h-16 w-full rounded-xl border border-line-strong bg-bg px-3 py-2 text-[0.82rem] break-all"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={copyLink}>
              Copy link
            </Button>
            {canShare && (
              <Button
                onClick={() =>
                  navigator
                    .share({ title: 'Slow Chess', text: 'Your move in our chess game', url: link })
                    .catch(() => {})
                }
              >
                Share…
              </Button>
            )}
            <span role="status" className="text-[0.86rem] text-muted">
              {copyMsg}
            </span>
          </div>
          <p className="text-[0.86rem] text-muted">
            Always use the newest link. An older link shows an older position.
          </p>
        </div>
      )}
      <div className="grid gap-1.5">
        <h3 className="text-[1.1rem]">Moves</h3>
        <ol className="flex max-h-37.5 flex-wrap gap-x-3.5 gap-y-1 overflow-y-auto text-[0.92rem] tabular-nums">
          {pairs.length ? (
            pairs.map(([a, b], k) => (
              <li key={k}>
                <b className="mr-1 font-semibold text-muted">{k + 1}.</b>
                {a}
                {b && ` ${b}`}
              </li>
            ))
          ) : (
            <li className="text-muted">No moves yet.</li>
          )}
        </ol>
      </div>
    </Shell>
  );
}
