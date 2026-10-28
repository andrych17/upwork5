'use client';

// Slow Chess in the board's look. The whole game lives in the link (#g=…), so a buddy game needs no server:
// you make one move, send the link, and your buddy answers the same way. Games against the computer use the
// same link with &ai=<level>, and games on this device are also kept in localStorage. The store below is the
// only place that changes the game; the screen reads its snapshot, so opening a link works like tapping Open.
import { useState, useSyncExternalStore } from 'react';
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
const PROMO = [
  ['q', 'Queen'],
  ['r', 'Rook'],
  ['b', 'Bishop'],
  ['n', 'Knight'],
] as const;
const LEVEL_NAME: Record<AiLevel, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const START = replay([]) as Replay;
// U+FE0E asks for the plain text glyph, not an emoji.
const glyph = (p: string) => `${GLYPH[p.toLowerCase()]}︎`;
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

interface Game extends GameRef {
  /** moves that came in with the link; in a buddy game you make one move after them, then send the link */
  loadedLen: number;
  sent: boolean;
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
  const game: Game = { ...g, tokens: [...g.tokens], loadedLen: g.tokens.length, sent: false };
  show(game, r, { flipped: !g.ai && !r.over && r.state.turn === 'b' });
}
function update(game: Game) {
  const r = replay(game.tokens);
  if (!('error' in r)) show(game, r);
}
function undo(game: Game, r: Replay) {
  if (!game.ai) return update({ ...game, tokens: game.tokens.slice(0, game.loadedLen), sent: false });
  // Against the computer, take back its reply too, so it is your turn again.
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
    if (!g) return;
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
const noSubscribe = () => () => {};
const getPageUrl = () => location.origin + location.pathname;

/* ---------- screen ---------- */
function Board({
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

function Setup({ list, error, buddy }: { list: Listed[]; error: string; buddy: string }) {
  const [picked, setPicked] = useState<'computer' | 'buddy' | null>(null);
  const opponent = picked ?? (buddy ? 'buddy' : 'computer');
  const [level, setLevel] = useState<AiLevel>('medium');
  const [me, setMe] = useState('');
  const [them, setThem] = useState<string | null>(null);
  const themName = them ?? buddy;

  function start() {
    if (opponent === 'computer') open({ id: newId(), w: 'You', b: 'Computer', tokens: [], ai: level });
    else open({ id: newId(), w: cleanName(me, 'White'), b: cleanName(themName, 'Black'), tokens: [] });
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
          Against the computer, it answers in a moment. With a buddy, you make one move, send them the link, and they
          answer whenever they return. The whole game lives in the link, and every rule is in: castling, en passant,
          promotion, check, checkmate and draws.
        </p>
        <div className="word-mode-switch" role="group" aria-label="Who you play">
          <button
            className={opponent === 'computer' ? 'selected' : ''}
            type="button"
            aria-pressed={opponent === 'computer'}
            onClick={() => setPicked('computer')}
          >
            Vs computer
          </button>
          <button
            className={opponent === 'buddy' ? 'selected' : ''}
            type="button"
            aria-pressed={opponent === 'buddy'}
            onClick={() => setPicked('buddy')}
          >
            With a buddy
          </button>
        </div>
        {opponent === 'computer' ? (
          <div className="word-mode-switch word-level" role="group" aria-label="Computer level">
            {AI_LEVELS.map((value) => (
              <button
                className={level === value ? 'selected' : ''}
                type="button"
                aria-pressed={level === value}
                key={value}
                onClick={() => setLevel(value)}
              >
                {LEVEL_NAME[value]}
              </button>
            ))}
          </div>
        ) : (
          <div className="chess-names">
            <label>
              Your name (White)
              <input
                value={me}
                maxLength={20}
                autoComplete="off"
                placeholder="White"
                onChange={(e) => setMe(e.target.value)}
              />
            </label>
            <label>
              Your buddy (Black)
              <input
                value={themName}
                maxLength={20}
                autoComplete="off"
                placeholder="Black"
                onChange={(e) => setThem(e.target.value)}
              />
            </label>
          </div>
        )}
        {error && <p className="chess-error">{error}</p>}
        {list.length > 0 && (
          <div className="chess-saved">
            <h3>Your games on this device</h3>
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
        <button className="send-move" type="button" onClick={start}>
          {opponent === 'computer' ? `Start a game vs the computer (${LEVEL_NAME[level]})` : 'Start game'}{' '}
          <span aria-hidden="true">→</span>
        </button>
        <p className="chess-note">
          {opponent === 'computer'
            ? 'You play White and move first.'
            : 'You play White and move first. Then you get a link to send your buddy.'}
        </p>
      </div>
    </section>
  );
}

export default function SlowChess({ buddy }: { buddy: string }) {
  const s = useSyncExternalStore(subscribe, getSnap, () => SERVER);
  const pageUrl = useSyncExternalStore(noSubscribe, getPageUrl, () => '');
  const [copyMsg, setCopyMsg] = useState('');
  const { game, r } = s;
  if (!game || !r) return <Setup list={s.list} error={s.error} buddy={buddy} />;

  const st = r.state;
  const vsComputer = !!game.ai;
  const moved = game.tokens.length > game.loadedLen;
  const canMove = !r.over && !s.thinking && !s.promo && (vsComputer ? st.turn === 'w' : !moved);
  const canUndo = !s.thinking && (vsComputer ? game.tokens.length > 0 : moved && !game.sent);
  const mover = st.turn === 'w' ? game.w : game.b;
  const waitingFor = st.turn === 'w' ? game.w : game.b;
  const link = pageUrl + gameHash(game);
  const pairs = Array.from({ length: Math.ceil(r.sans.length / 2) }, (_, k) => r.sans.slice(k * 2, k * 2 + 2));

  let status: { title: string; text: string };
  if (r.over)
    status = {
      title:
        r.over === 'd'
          ? 'Draw'
          : vsComputer
            ? r.over === 'w'
              ? 'You win'
              : 'The computer wins'
            : `${r.over === 'w' ? game.w : game.b} wins`,
      text: `${r.why}.`,
    };
  else if (s.thinking) status = { title: 'The computer is thinking…', text: 'It plays Black.' };
  else if (vsComputer)
    status = { title: r.check ? 'Check. Your move' : 'Your move', text: 'Tap a piece, then tap where it goes.' };
  else if (game.sent)
    status = { title: 'Move sent', text: `Waiting for ${waitingFor}. Their move comes back as a new link.` };
  else if (moved)
    status = { title: 'Move ready', text: `Confirm it, then send ${waitingFor} the link. Changed your mind? Undo.` };
  else
    status = {
      title: `${r.check ? 'Check. ' : ''}${mover}’s move`,
      text: 'Tap a piece, then tap where it goes. Dots show legal moves.',
    };

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
  function copyLink() {
    const fail = () => setCopyMsg('Select the link and copy it.');
    if (!navigator.clipboard) return fail();
    navigator.clipboard.writeText(link).then(() => setCopyMsg('Copied.'), fail);
  }
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <section className="chess-game" id="slow-chess">
      <div className="chess-copy">
        <p className="section-label">Slow Chess</p>
        <h2>{vsComputer ? 'You against the computer.' : 'One move now. Another whenever you return.'}</h2>
        <div className="chess-players">
          {(['w', 'b'] as const).map((color) => {
            const name = color === 'w' ? game.w : game.b;
            const label = vsComputer && color === 'b' ? `Computer · ${LEVEL_NAME[game.ai!]}` : name;
            return (
              <div className={`chess-opponent ${!r.over && st.turn === color ? 'chess-to-move' : ''}`} key={color}>
                <div className={`opponent-mark ${color === 'w' ? 'mark-white' : ''}`}>
                  {vsComputer ? (color === 'w' ? 'You' : 'CPU') : initials(name)}
                </div>
                <div>
                  <strong>{label}</strong>
                  <span>{color === 'w' ? 'White' : 'Black'}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className={`move-status ${r.check || r.over ? 'move-status-alert' : ''}`} role="status" aria-live="polite">
          <strong>{status.title}</strong>
          <span>{status.text}</span>
        </div>
        <div className="chess-actions">
          <button type="button" disabled={!canUndo} onClick={() => undo(game, r)}>
            {vsComputer ? 'Take back' : 'Undo my move'}
          </button>
          <button type="button" onClick={() => set({ flipped: !s.flipped })}>
            Flip board
          </button>
          <button
            type="button"
            disabled={!!r.over || s.thinking || (!vsComputer && moved)}
            onClick={() =>
              confirm('Resign this game?') && update({ ...game, tokens: [...game.tokens, 'r'], sent: false })
            }
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
        {!vsComputer && !r.over && (
          <button
            className="send-move"
            type="button"
            disabled={!moved || game.sent}
            onClick={() => set({ game: { ...game, sent: true } })}
          >
            {game.sent ? `Waiting for ${waitingFor}` : 'Confirm move'} <span aria-hidden="true">→</span>
          </button>
        )}
        {!vsComputer && (game.sent || r.over) && (
          <div className="move-notification chess-share">
            <label htmlFor="chess-link">{r.over ? 'Send the finished game' : `Send this link to ${waitingFor}`}</label>
            <input id="chess-link" readOnly value={link} onFocus={(e) => e.target.select()} />
            <div>
              <button type="button" onClick={copyLink}>
                Copy link
              </button>
              {canShare && (
                <button
                  type="button"
                  onClick={() =>
                    navigator
                      .share({ title: 'Slow Chess', text: 'Your move in our chess game', url: link })
                      .catch(() => {})
                  }
                >
                  Share…
                </button>
              )}
              <span role="status">{copyMsg}</span>
            </div>
            <p>
              Always use the newest link. Once member accounts are live, the move reaches your Buddy Room by itself.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
