// Glue between Kelly's live-room games (11 Nov zips; engines and data files copied unchanged into ./games) and the
// game-act Edge Function: which game a session plays, which moves the page may send, and what each player may see.
// Every game has the same engine shape: newRoom(code, seed), apply(state, action, ctx), and viewFor(state, id) when
// part of the game is secret (Kelly's READMEs: "a server must apply every move with the engine and send each player
// viewFor"). The full state, with the random seed, stays on the server.
import './games/window.ts';
import './games/inventit.js';
import './games/inventit-items.js';
import './games/GuessWhosStory.js';
import './games/GuessWhosStory-data.js';
import './games/PuzzleRoom.js';
import './games/PuzzleRoom-data.js';
import './games/DrawAndGuess.js';
import './games/DrawAndGuess-words.js';

export type GameKey = 'invent-it' | 'guess-whose-story' | 'puzzle-room' | 'draw-and-guess';
export type GameState = Record<string, unknown> & { players?: { id: string }[]; phase?: string };
export type Move = Record<string, unknown> & { type: string };
type Result = { ok: true; state: GameState } | { ok: false; error: string };

export interface Engine {
  DEFAULT_CONFIG: Record<string, number>;
  newRoom(code: string, seed?: number): GameState;
  apply(state: GameState, action: Move & { id: string; name: string }, ctx: Record<string, unknown>): Result;
  viewFor?(state: GameState, id?: string): GameState;
}

type Fields = (raw: Record<string, unknown>) => Record<string, unknown> | null;

interface Game {
  /** The name Kelly's engine file puts on globalThis. */
  global: string;
  /** What apply() needs besides now and endsAt (items, words, prompts, puzzles). */
  data: () => Record<string, unknown>;
  /** Moves a player may send beyond the shared ones, each keeping only its own fields (null = refuse). */
  moves: Record<string, Fields>;
  /** viewFor gives each player something different (else everyone gets the same view). */
  perPlayer: boolean;
  /** Things the page shows that only the engine can work out (team table, who speaks), worked out at save time. */
  extras: (state: GameState, now: number, engine: Engine) => Record<string, unknown>;
  /** Removes what viewFor leaves in but would give a secret away. */
  hide?: (view: GameState) => void;
}

const SHARED = ['join', 'leave', 'start', 'again', 'timeout', 'nextround'];
const SERVER_ONLY = ['rng', 'used', 'usedWords', 'usedPrompts'];

const whole = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;
const field =
  (name: string, min: number, max: number): Fields =>
  (raw) => {
    const v = whole(raw[name], min, max);
    return v === null ? null : { [name]: v };
  };
const none: Fields = () => ({});
const teamMode: Fields = (raw) => (raw.mode === 'random' || raw.mode === 'choose' ? { mode: raw.mode } : null);

const g = globalThis as Record<string, unknown>;

// ---------- Invent It ----------
interface Category {
  name: string;
  items: string[];
}
const inventItems = () => (g.MeetDoInventItItems as string[] | undefined) ?? [];
let inventCats: Category[] | null = null;
// The engine drops categories with fewer than two known items and numbers the rest; dropping them here first keeps
// the engine's category numbers the same as this list's, so the page gets the right names.
function inventCategories(): Category[] {
  if (inventCats) return inventCats;
  const items = new Set(inventItems());
  const raw = (g.MeetDoInventItCategories as Category[] | undefined) ?? [];
  inventCats = raw.filter((c) => c?.items?.filter((n) => items.has(n)).length >= 2);
  return inventCats;
}

interface InventEngine extends Engine {
  teamBoard(s: GameState): unknown[];
  speaker(s: GameState): { id: string } | null;
  roleFor(s: GameState): string | null;
  raters(s: GameState): { id: string }[];
  canContinue(s: GameState, cfg: Record<string, number>, now: number): boolean;
  cfgOf(o?: unknown): Record<string, number>;
}

// ---------- Guess Whose Story ----------
interface StoryEngine extends Engine {
  scoreboard(s: GameState): { id: string; name: string; score: number; rank: number }[];
  voters(s: GameState): string[];
  canContinue(s: GameState, cfg: Record<string, number>, now: number): boolean;
  cfgOf(o?: unknown): Record<string, number>;
}
// A guess is a player's id (3+ players) or y / n (2 players); the engine checks it is someone in the question.
const PLAYER_ID = /^[\w-]{1,64}$/;

// ---------- Puzzle Room ----------
interface Puzzle {
  h?: string[];
}
const puzzleCats = () =>
  (g.MeetDoPuzzleData as { categories?: { name: string; puzzles: Puzzle[] }[] } | undefined)?.categories ?? [];
interface PuzzleEngine extends Engine {
  teamBoard(s: GameState): unknown[];
  canContinue(s: GameState, cfg: Record<string, number>, now: number): boolean;
  cfgOf(o?: unknown): Record<string, number>;
}

// ---------- Draw and Guess ----------
interface DrawEngine extends Engine {
  scoreboard(s: GameState): { id: string; name: string; score: number; gain: number; rank: number }[];
}
// A line is a colour (0 to 5, 6 = eraser), a width (0 to 2) and up to 800 points: whole x,y numbers from 0 to 1000.
// The engine checks the same again; keeping only these fields here means nothing else rides along in the saved state.
const strokeMove: Fields = (raw) => {
  const st = raw.stroke as Record<string, unknown> | null | undefined;
  if (!st || typeof st !== 'object') return null;
  const c = whole(st.c, 0, 6);
  const w = whole(st.w, 0, 2);
  const p = st.p;
  const max = (g.MeetDoDrawGuess as Engine).DEFAULT_CONFIG.maxPoints * 2;
  if (c === null || w === null || !Array.isArray(p) || p.length < 2 || p.length % 2 || p.length > max) return null;
  if (!p.every((n) => whole(n, 0, 1000) !== null)) return null;
  return { stroke: { c, w, p: [...p] } };
};

const GAMES: Record<GameKey, Game> = {
  'invent-it': {
    global: 'MeetDoInventIt',
    data: () => ({ items: inventItems(), categories: inventCategories() }),
    moves: {
      next: none,
      pass: none,
      mode: teamMode,
      team: field('team', -1, 5),
      pick: field('cat', 0, 2),
      rate: field('value', 1, 5),
    },
    perPlayer: false,
    extras: (s, now, engine) => {
      const T = engine as InventEngine;
      const cats = inventCategories();
      const stage = s.stage as { cats?: number[] | null; cat?: number | null } | null;
      return {
        board: T.teamBoard(s),
        speaker: T.speaker(s)?.id ?? null,
        role: T.roleFor(s),
        raters: T.raters(s).map((p) => p.id),
        catNames: (stage?.cats ?? []).map((i) => cats[i]?.name ?? ''),
        catName: stage?.cat != null ? (cats[stage.cat]?.name ?? null) : null,
        // On the results screen: is there another round after the chat break?
        more: s.phase === 'results' ? T.canContinue(s, T.cfgOf(), now) : null,
      };
    },
  },
  'guess-whose-story': {
    global: 'MeetDoGuessWhosStory',
    data: () => ({ data: g.MeetDoGuessWhosStoryData }),
    moves: {
      answer: (raw) => (typeof raw.value === 'boolean' ? { value: raw.value } : null),
      next: none,
      vote: (raw) => (typeof raw.target === 'string' && PLAYER_ID.test(raw.target) ? { target: raw.target } : null),
    },
    // viewFor hides everyone's answers, the mystery person and the guesses until the reveal; you see your own.
    perPlayer: true,
    // players[].myst (times picked) goes up the moment the mystery person is picked: comparing two views would
    // name them before anyone guesses.
    hide: (v) => {
      for (const p of (v.players ?? []) as Record<string, unknown>[]) delete p.myst;
    },
    extras: (s, now, engine) => {
      const T = engine as StoryEngine;
      const cur = s.cur as { yes: Record<string, boolean>; votes: Record<string, string> } | null;
      return {
        board: T.scoreboard(s).map(({ id, name, score, rank }) => ({ id, name, score, rank })),
        // Kelly's page counts these from the full state; the counts give nothing away.
        answered: cur ? Object.keys(cur.yes).length : 0,
        guessed: cur ? Object.keys(cur.votes).length : 0,
        voters: cur ? T.voters(s).length : 0,
        more: s.phase === 'results' ? T.canContinue(s, T.cfgOf(), now) : null,
      };
    },
  },
  'puzzle-room': {
    global: 'MeetDoPuzzleRoom',
    data: () => ({ data: g.MeetDoPuzzleData }),
    moves: {
      next: none,
      mode: teamMode,
      team: field('team', -1, 5),
      pick: field('cat', 0, 2),
      // Only the team's Reader may tap; the engine checks that.
      guess: field('option', 0, 3),
      hint: none,
      giveup: none,
    },
    perPlayer: false,
    // viewFor removes the right answer, but stage.pz (which puzzle in the bank) would point straight to it.
    hide: (v) => {
      const st = v.stage as Record<string, unknown> | null;
      if (st) delete st.pz;
    },
    extras: (s, now, engine) => {
      const T = engine as PuzzleEngine;
      const cfg = T.cfgOf();
      const cats = puzzleCats();
      const st = s.stage as {
        cats?: number[] | null;
        cat?: number | null;
        pz?: { c: number; p: number } | null;
        hints?: number;
      } | null;
      const hints = st?.pz ? (cats[st.pz.c]?.puzzles[st.pz.p]?.h?.length ?? 0) : 0;
      return {
        board: T.teamBoard(s),
        catNames: (st?.cats ?? []).map((i) => cats[i]?.name ?? ''),
        catName: st?.cat != null ? (cats[st.cat]?.name ?? null) : null,
        // Some puzzles have fewer hints than the two allowed.
        hintsLeft: Math.max(0, Math.min(cfg.maxHints, hints) - (st?.hints ?? 0)),
        more: s.phase === 'results' ? T.canContinue(s, cfg, now) : null,
      };
    },
  },
  'draw-and-guess': {
    global: 'MeetDoDrawGuess',
    data: () => ({ words: g.MeetDoDrawWords }),
    moves: {
      choose: field('i', 0, 2),
      reroll: none,
      stroke: strokeMove,
      live: strokeMove,
      undo: none,
      clear: none,
      // Only the artist awards a guess; the engine checks that and that the player is in the room.
      guessed: (raw) => (typeof raw.who === 'string' && PLAYER_ID.test(raw.who) ? { who: raw.who } : null),
      giveup: none,
    },
    // viewFor hides the word, the three offered words and their category from everyone but the artist.
    perPlayer: true,
    extras: (s, _now, engine) => ({ board: (engine as DrawEngine).scoreboard(s) }),
  },
};

export const GAME_KEYS = Object.keys(GAMES) as GameKey[];

export function isGame(key: unknown): key is GameKey {
  return typeof key === 'string' && key in GAMES && GAMES[key as GameKey].global !== '';
}

export function engine(key: GameKey): Engine {
  const t = g[GAMES[key].global] as Engine | undefined;
  if (!t) throw new Error(`${key} engine not loaded`);
  return t;
}

export function gameData(key: GameKey): Record<string, unknown> {
  return GAMES[key].data();
}

/** Keeps only the fields a move can carry. The player's id and name are added by the server, never taken from here. */
export function cleanMove(key: GameKey, raw: unknown): Move | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.type !== 'string') return null;
  if (SHARED.includes(a.type)) return { type: a.type };
  const own = Object.hasOwn(GAMES[key].moves, a.type) ? GAMES[key].moves[a.type] : undefined;
  const fields = own?.(a);
  return fields ? { ...fields, type: a.type } : null;
}

/**
 * A timeout before the step's time is up does nothing. Kelly's other engines refuse it themselves; Draw and Guess would
 * pick the artist's word for them if any player sent it while they were still choosing.
 */
export function timeoutTooEarly(state: GameState, action: Move, now: number, endsAt?: number): boolean {
  const due = typeof state.deadline === 'number' ? state.deadline : 0;
  return action.type === 'timeout' && due > now && !(endsAt && now >= endsAt);
}

function strip(view: GameState): GameState {
  for (const k of SERVER_ONLY) delete view[k];
  return view;
}

/**
 * What the players may read after a move: `pub` for everyone in the session, and `own` for each player whose view
 * differs (only they can read it). Without viewFor, the whole state minus the seed is public.
 */
export function viewsOf(
  key: GameKey,
  state: GameState,
  now: number,
): { pub: GameState; own: Record<string, GameState> } {
  const T = engine(key);
  const G = GAMES[key];
  const ui = G.extras(state, now, T);
  const look = (id: string): GameState => {
    const v = strip({ ...(T.viewFor ? T.viewFor(state, id) : structuredClone(state)), ui });
    G.hide?.(v);
    return v;
  };
  const pub = look('');
  const own: Record<string, GameState> = {};
  if (G.perPlayer) {
    const shared = JSON.stringify(pub);
    for (const p of state.players ?? []) {
      const v = look(p.id);
      if (JSON.stringify(v) !== shared) own[p.id] = v;
    }
  }
  return { pub, own };
}

/** A new room with a seed nobody can guess (Kelly's newRoom would otherwise seed from the room code and the clock). */
export function newRoom(key: GameKey, code: string): GameState {
  return engine(key).newRoom(code, crypto.getRandomValues(new Int32Array(1))[0]);
}
