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
export const POINTS_PER_RIGHT = 1;
export const BADGE_BONUS = 2;
export const AWAY_AFTER_MISSES = 2;

// Kelly's Basic Rules (trivia-rules.txt, 6 Nov zip), shown on the booking page and in the game.
export const TRIVIA_RULES: string[] = [
  `Up to ${MAX_PLAYERS} players per room. Anyone in the room can press Start.`,
  `On your turn, spin the spinner (1 to ${SPINNER_MAX}) and move that many spaces, either way round the ring.`,
  `Answer a question in the color of the space you land on. You have ${ANSWER_SECONDS} seconds, shown by the hourglass.`,
  `Right answer: ${POINTS_PER_RIGHT} point, and you keep your turn. Wrong answer or out of time: no points and the turn passes.`,
  `Answer right on a big lettered badge space to earn that color’s badge, plus ${BADGE_BONUS} bonus points. Landing on the ↻ space gives you another spin.`,
  'Once you hold every badge, answer the final question. Right wins the game. Wrong, and you try again next turn.',
  `The Timer is a volunteer who can stop and start the sand, but not on their own question, and stopped time is limited to ${MAX_PAUSE_SECONDS} seconds per question.`,
  `Miss your turn ${AWAY_AFTER_MISSES} times in a row and you are marked away and skipped until you act again.`,
];
export const TRIVIA_SCORING = `Scoring: ${POINTS_PER_RIGHT} point per right answer + ${BADGE_BONUS} bonus points per badge earned. Ties are ranked by badges. The scoreboard updates after every question. The winner is whoever answers the final question right.`;

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
  color: number;
  misses: number;
  away: boolean;
  right: number;
  /** Kelly 6 Nov: 1 per right answer + 2 per badge. Missing in games saved before the scoring update. */
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
  q: { id: string; cat: number; final: boolean; badgeSpace?: boolean; clock: TriviaClock } | null;
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
    final: boolean;
  } | null;
  winner: string | null;
  nCats: number;
}

export interface TriviaCard {
  catName: string;
  color: string;
  q: string;
  final: boolean;
  choices: string[];
}

export interface TriviaSnapshot {
  state: TriviaState;
  card: TriviaCard | null;
  rev: number;
}

export type TriviaMove =
  | { type: 'join' | 'leave' | 'start' | 'again' | 'timeout' | 'spin' }
  | { type: 'move'; to: number }
  | { type: 'answer'; choice: number }
  | { type: 'theme'; cats?: string[]; random?: number }
  | { type: 'timer'; on: boolean }
  | { type: 'clock'; run: boolean };

export interface Space {
  i: number;
  type: 'badge' | 'roll' | 'plain';
  cat: number;
}

/** The ring, exactly as the engine numbers it: every 6th space a badge space, the middle of each stretch "Roll again". */
export function board(nCats: number): Space[] {
  const per = SPACES_PER_COLOUR;
  return Array.from({ length: nCats * per }, (_, i): Space => {
    const r = i % per;
    if (r === 0) return { i, type: 'badge', cat: i / per };
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

/** The engine's scoreboard(): by score, then badges, then accuracy; level on score and badges = same rank (1, 1, 3). */
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
    r.rank = prev && prev.score === r.score && prev.badges === r.badges ? prev.rank : i + 1;
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
