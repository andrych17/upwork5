// Glue between Kelly's trivia engine (trivia.js, unchanged from her 7 Nov zip: points, badges after 4 right, game ends with
// the session, pause requests) and the trivia-act Edge Function:
// which moves the page may send, and which parts of the game state stay on the server.
import './trivia.js';

export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface Bank {
  categories: Category[];
  questions: { id: string; cat: number; q: string; a: string; wrong: string[]; note?: string; source?: string }[];
}

// The engine's game JSON. Only the two hidden fields are typed here; the rest passes through untouched.
export type GameState = Record<string, unknown> & {
  rng?: number;
  q?: (Record<string, unknown> & { order?: number[] }) | null;
};

// What the page never sees: the open question's choice order (it gives away the answer) and the random seed
// (with it, the next question and choice order could be worked out in advance).
export interface Secret {
  order: number[] | null;
  rng: number;
}

export interface TriviaAction {
  type: string;
  to?: number;
  choice?: number;
  cats?: string[];
  random?: number;
  on?: boolean;
  run?: boolean;
}

type Result = { ok: true; state: GameState } | { ok: false; error: string };

export interface TriviaEngine {
  newRoom(code: string, nCats: number): GameState;
  apply(
    state: GameState,
    action: TriviaAction & { id: string; name: string },
    ctx: { bank: Bank; now: number; endsAt?: number },
  ): Result;
  cardFor(state: GameState, bank: Bank): unknown;
  validateBank(input: unknown): { ok: boolean; errors: string[]; bank: Bank };
}

export function engine(): TriviaEngine {
  const t = (globalThis as { MeetDoTrivia?: TriviaEngine }).MeetDoTrivia;
  if (!t) throw new Error('trivia engine not loaded');
  return t;
}

const TYPES = new Set([
  'join',
  'leave',
  'theme',
  'start',
  'again',
  'timeout',
  'timer',
  'clock',
  'pause',
  'spin',
  'move',
  'answer',
]);
const MAX_SPACE = 299;
const MAX_CHOICE = 5;
const MAX_CATEGORIES = 12;

const whole = (v: unknown, max: number): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : undefined;

/** Keeps only the fields a move can carry. The player's id and name are added by the server, never taken from here. */
export function cleanAction(raw: unknown): TriviaAction | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.type !== 'string' || !TYPES.has(a.type)) return null;
  const out: TriviaAction = { type: a.type };
  if (a.type === 'move') out.to = whole(a.to, MAX_SPACE);
  if (a.type === 'answer') out.choice = whole(a.choice, MAX_CHOICE);
  if (a.type === 'theme') {
    const random = whole(a.random, MAX_CATEGORIES);
    if (random) out.random = random;
    else
      out.cats = (Array.isArray(a.cats) ? a.cats : [])
        .filter((c): c is string => typeof c === 'string')
        .slice(0, MAX_CATEGORIES)
        .map((c) => c.slice(0, 40));
  }
  if (a.type === 'timer') out.on = a.on !== false;
  if (a.type === 'clock') out.run = a.run !== false;
  return out;
}

/** Splits a game state into what every player may read and what only the server keeps. */
export function splitSecret(state: GameState): { pub: GameState; secret: Secret } {
  const pub = structuredClone(state);
  const secret: Secret = { order: pub.q?.order ?? null, rng: typeof pub.rng === 'number' ? pub.rng : 0 };
  if (pub.q) delete pub.q.order;
  delete pub.rng;
  return { pub, secret };
}

/** Puts the hidden part back so the engine can apply the next move. */
export function joinSecret(pub: GameState, secret: Partial<Secret> | null | undefined): GameState {
  const state = structuredClone(pub);
  state.rng = typeof secret?.rng === 'number' ? secret.rng : 0;
  if (state.q) state.q.order = Array.isArray(secret?.order) ? secret.order : [];
  return state;
}
