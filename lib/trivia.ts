// Trivia, Trivier, Triviest in the live room: the game state the page reads (what trivia-act saves in
// trivia_rooms, without the answer order and the seed) and the drawing helpers from Kelly's trivia.html.
// The rules themselves live only in supabase/functions/_shared/trivia.js, on the server.

export const TRIVIA_SLUG = 'trivia-trivier-triviest';

// Kelly's DEFAULT_CONFIG values the page shows or times against.
export const SPACES_PER_COLOUR = 6;
export const ANSWER_SECONDS = 60;
export const ACTION_SECONDS = 30;
export const MAX_PAUSE_SECONDS = 60;
export const MAX_PLAYERS = 12;
export const SPINNER_MAX = 6;
export const POINTS_PER_RIGHT = 10;
export const BADGE_AFTER = 4;
export const BADGE_BONUS = 5;
export const AWAY_AFTER_MISSES = 2;
export const SESSION_MINUTES = 60;

// Kelly's Basic Rules (trivia-rules.txt, 7 Nov zip), shown on the booking page and in the game.
export const TRIVIA_RULES: string[] = [
  `On your turn, spin the spinner (1 to ${SPINNER_MAX}) and move that many spaces, in either direction round the ring.`,
  `Answer a question in the color of the space you land on. You have ${ANSWER_SECONDS} seconds, shown by the hourglass.`,
  `Right answer: ${POINTS_PER_RIGHT} points, and you keep your turn. Wrong answer or out of time: no points and the turn passes.`,
  `Answer ${BADGE_AFTER} questions right in one category to earn that category’s badge, worth ${BADGE_BONUS} bonus points.`,
  'Landing on the ↻ space gives you another spin.',
  `The Timer is a volunteer who works the hourglass. If another player asks for a pause because of an unforeseen interruption, the Timer can pause the sand (up to ${MAX_PAUSE_SECONDS} seconds per question). The Timer cannot pause for themselves, so gives up this help on their own questions.`,
  `Miss your turn ${AWAY_AFTER_MISSES} times in a row and you are marked away and skipped until you act again.`,
  `The game ends when the ${SESSION_MINUTES}-minute session ends. The highest score wins; players tied on the top score win together.`,
];
export const TRIVIA_SCORING = `Scoring: ${POINTS_PER_RIGHT} points per right answer + ${BADGE_BONUS} bonus points per badge. The scoreboard ranks players high to low and updates after every question.`;

// Token colours, same order as the engine's 12 player colours.
export const PLAYER_COLOURS = [
  '#d1495b',
  '#2e86ab',
  '#3a9d5d',
  '#8e5ba8',
  '#e08e2b',
  '#00798c',
  '#b5651d',
  '#6c757d',
  '#c2185b',
  '#1b4965',
  '#7a9e1f',
  '#5e548e',
];

export interface TriviaCategory {
  id: string;
  name: string;
  color: string;
}

export interface TriviaPlayer {
  id: string;
  name: string;
  pos: number;
  badges: boolean[];
  /** Right answers per category; the badge comes at BADGE_AFTER. Missing in games saved before 7 Nov. */
  catRight?: number[];
  color: number;
  misses: number;
  away: boolean;
  right: number;
  /** Kelly 7 Nov: 10 per right answer + 5 per badge. Missing in games saved before the scoring update. */
  points?: number;
  asked: number;
}

export interface TriviaClock {
  total: number;
  left: number;
  running: boolean;
  since: number;
  pausedAt: number;
  pausedUsed: number;
}

export interface TriviaState {
  phase: 'lobby' | 'spin' | 'move' | 'question' | 'over';
  players: TriviaPlayer[];
  turn: number;
  spin: number | null;
  options: number[];
  /** pauseReq: the player who asked the Timer for a pause on this question, until the Timer pauses. */
  q: { id: string; cat: number; pauseReq?: string | null; clock: TriviaClock } | null;
  deadline: number;
  timekeeper: string | null;
  themes: string[];
  lastSpin?: number;
  spins?: number;
  log: string[];
  last: {
    player: string;
    ok: boolean;
    timedOut: boolean;
    correct: string;
    note: string;
  } | null;
  winner: string | null;
  /** Everyone on the top score when the game ended (a tie is a shared win). */
  winners?: string[];
  /** When the game ends: the session's end, set at Start. 0 in the lobby. */
  endsAt?: number;
  nCats: number;
}

export interface TriviaCard {
  catName: string;
  color: string;
  q: string;
  choices: string[];
}

export interface TriviaSnapshot {
  state: TriviaState;
  card: TriviaCard | null;
  rev: number;
}

export type TriviaMove =
  | { type: 'join' | 'leave' | 'start' | 'again' | 'timeout' | 'spin' | 'pause' }
  | { type: 'move'; to: number }
  | { type: 'answer'; choice: number }
  | { type: 'theme'; cats?: string[]; random?: number }
  | { type: 'timer'; on: boolean }
  | { type: 'clock'; run: boolean };

export interface Space {
  i: number;
  type: 'roll' | 'plain';
  cat: number;
}

/** The ring, exactly as the engine numbers it: the middle of each stretch of 6 is "Roll again", the rest are colors. */
export function board(nCats: number): Space[] {
  const per = SPACES_PER_COLOUR;
  return Array.from({ length: nCats * per }, (_, i): Space => {
    const r = i % per;
    if (r === Math.floor(per / 2)) return { i, type: 'roll', cat: -1 };
    return { i, type: 'plain', cat: (Math.floor(i / per) + r) % nCats };
  });
}

/** The categories this room plays with (a theme night uses only some), in the bank's order, as the engine's view(). */
export function roomCategories(all: TriviaCategory[], themes: string[]): TriviaCategory[] {
  const picked = themes.length ? all.filter((c) => themes.includes(c.id)) : [];
  return picked.length ? picked : all;
}

/** Where the spinner ends after a spin of n: segment n under the pointer, after three full turns. */
export function wheelAfter(deg: number, n: number): number {
  const target = -((n - 1) * 60 + 30);
  const delta = (((target - (deg % 360)) % 360) + 360) % 360;
  return deg + 1080 + delta;
}

/** Who won: everyone on the top score, or the single winner of a game saved before 7 Nov. */
export function winnersOf(state: Pick<TriviaState, 'winner' | 'winners'>): string[] {
  return state.winners?.length ? state.winners : state.winner ? [state.winner] : [];
}

/** Milliseconds left on the hourglass, and the stopped time still allowed, at server time `now`. */
export function clockLeft(
  state: TriviaState,
  now: number,
): { left: number; total: number; running: boolean; pauseLeft: number } | null {
  const c = state.phase === 'question' ? state.q?.clock : undefined;
  if (!c) return null;
  const left = c.running ? Math.max(0, state.deadline - now) : c.left;
  const pauseLeft = Math.max(0, MAX_PAUSE_SECONDS * 1000 - c.pausedUsed - (c.running ? 0 : now - c.pausedAt));
  return { left, total: c.total, running: c.running, pauseLeft };
}

export interface ScoreRow {
  id: string;
  name: string;
  color: number;
  seat: number;
  score: number;
  right: number;
  asked: number;
  badges: number;
  badgesTotal: number;
  away: boolean;
  rank: number;
}

/** The engine's scoreboard(): listed by score, then badges, then accuracy; level on score = same rank (1, 1, 3). */
export function scoreboard(state: Pick<TriviaState, 'players'>): ScoreRow[] {
  const total = state.players[0]?.badges.length ?? 0;
  const accuracy = (r: { right: number; asked: number }) => (r.asked ? r.right / r.asked : 0);
  const rows: ScoreRow[] = state.players.map((p, i) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    seat: i + 1,
    score: p.points ?? 0,
    right: p.right,
    asked: p.asked,
    badges: p.badges.filter(Boolean).length,
    badgesTotal: total,
    away: Boolean(p.away),
    rank: 0,
  }));
  rows.sort((a, b) => b.score - a.score || b.badges - a.badges || accuracy(b) - accuracy(a) || a.seat - b.seat);
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.rank = prev && prev.score === r.score ? prev.rank : i + 1;
  });
  return rows;
}

/** Dark or white text on a category color, as Kelly's ink(): yellow and other light colors get dark text. */
export function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150 ? '#111' : '#fff';
}

/** A newer save replaces what the page shows; an older one (a slow refresh) never brings the game back. */
export function newer(current: TriviaSnapshot | null, next: TriviaSnapshot): boolean {
  return !current || next.rev > current.rev;
}
