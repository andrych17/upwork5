// Kelly's live-room games from the 11 Nov zips: which session plays which game, her Basic Rules, and the shapes of
// the views the game-act Edge Function saves (game_views / game_private_views, schema section 38). The rules
// themselves run only on the server (supabase/functions/_shared/games); the page just draws the view it gets.

export type GameKey = 'invent-it' | 'guess-whose-story' | 'puzzle-room' | 'draw-and-guess';

export const GAME_TITLES: Record<GameKey, string> = {
  'invent-it': 'Invent It',
  'guess-whose-story': 'Guess Whose Story',
  'puzzle-room': 'Puzzle Room',
  'draw-and-guess': 'Draw and Guess',
};

// Same patterns as game_for_slug() in schema.sql: Kelly's catalog slug, or the "<title>-<date>" slug Admin > Sessions
// makes from a title such as "Invent It" or "Draw & Guess".
const SLUGS: [RegExp, GameKey][] = [
  [/^invent-it(-|$)/, 'invent-it'],
  [/^guess-(whose|whos|who-s)-story(-|$)/, 'guess-whose-story'],
  [/^puzzle-room(-|$)/, 'puzzle-room'],
  [/^draw-(and-)?guess(-|$)/, 'draw-and-guess'],
];

export function gameForSlug(slug: string | null | undefined): GameKey | null {
  return SLUGS.find(([re]) => re.test(slug ?? ''))?.[1] ?? null;
}

export interface GameRules {
  players: string;
  object: string;
  howToWin: string;
  rules: string[];
  footer?: string;
}

// Word for word from Kelly's <game>-rules.txt (scripts/fixtures; scripts/test-live-games.ts checks them).
export const GAME_RULES: Partial<Record<GameKey, GameRules>> = {
  'invent-it': {
    players: 'For 2 to 12 players, in teams of 1 to 6. Everything is spoken out loud in the video room. No typing.',
    object:
      'Work with your team to invent something out loud from two surprise items, and make the other players want it.',
    howToWin:
      'Score the most points. Each turn your team scores the average 1-to-5 rating the other players give your invention, and your total is every turn added up. When the session ends, the highest total wins. Teams tied on the top total win together.',
    rules: [
      'Players are put into teams when the game starts, either at random or by choosing (set in the lobby before Start). With 2 players each plays alone as a team of one; with 3 players it is a team of 2 against a team of 1. A team with fewer than 3 players gets longer turns, so every team has about the same time on stage.',
      'Teams go on stage one at a time. First comes a 10-second huddle: the team is shown 3 categories and each teammate taps one (most taps wins; ties and no taps are settled at random). Then the team gets two random items from that category to combine into one invention.',
      'Each team member speaks for 15 seconds, in turn. The first says what the invention is, each next one starts with "Yes, and..." and adds a feature, and the last one gives it a name. Press Next to finish early, or Pass to skip your turn.',
      'Then everyone on the other teams taps a rating from 1 to 5 for "How much would you buy it?" 1 = No way! 5 = Absolutely! Nobody rates their own team.',
      'A team’s score for its turn is the average of the ratings it got (to 2 decimals). A team’s total is all its turn scores added together.',
      'After every team has had a turn, the round ends and the scoreboard updates. Then there is a 60-second chat break with a conversation prompt (anyone can end it early), and a new round begins, with a different person starting for each team.',
      'Rounds keep going until there is not enough time left for another chat break and a full round. The highest total wins; teams tied on the top total win together.',
      'No round starts unless it can finish before the 60-minute session ends. If time does run out, the team on stage is not scored.',
    ],
    footer: 'If nobody on a team speaks, that turn is skipped and scores 0.',
  },
  'guess-whose-story': {
    players:
      'For 2 to 12 players, everyone for themselves. Talked over out loud in the video room. No typing: players only tap Yes or No, then tap a name.',
    object:
      'Find out who in the room said yes to a question about themselves, by talking it over out loud, and hear the story behind it.',
    howToWin:
      'Score the most points. Guess the mystery person for 3 points. When you are the mystery person, you score 1 point, plus 1 more for every player who guesses wrong (up to 5 extra). When the session ends, the highest score wins. Players tied on the top score win together.',
    rules: [
      'A round is 6 questions long.',
      'A question about you appears, like "Have you ever ridden a horse?" Everyone secretly taps Yes or No (8 seconds).',
      'With 3 or more players, the game picks ONE of the people who said Yes as the mystery person (people who have been picked the fewest times go first). Everyone sees how many players said Yes.',
      'Talk it over OUT LOUD for 40 seconds: who do you think it is, and why? Ask questions, joke around, trade clues. The mystery person tries to stay cool. Anyone can tap "Ready to guess" to move on early.',
      'Then everyone except the mystery person taps who they think it is (12 seconds). A right guess is 3 points. The mystery person gets 1 point for being picked, plus 1 for every wrong guess (up to 5).',
      'STORY TIME: the mystery person is revealed and tells the story behind their Yes out loud (up to 30 seconds; anyone can tap Next to move on). Players who said Yes but were not picked are revealed too.',
      'With exactly 2 players, you both tap Yes or No in secret, talk, then each guess what the OTHER person answered. A right guess is 3 points, and you get 1 point whenever the other person guesses wrong. Then you both share the story.',
      'If nobody says Yes, the question is skipped.',
      'After 6 questions there are round results, then a 60-second chat break with a conversation prompt (anyone can end it early), and the next round begins.',
      'Rounds keep going while a full round fits before the 60-minute session ends. If time runs out in the middle of a question, that question is not scored.',
    ],
  },
  'puzzle-room': {
    players:
      'For 2 to 12 players, in teams of 1 to 6. Puzzles are talked over out loud in the video room. Almost no typing: every puzzle has four answers to tap.',
    object: 'Work with your team to solve riddles and word puzzles together, out loud, before the clock runs out.',
    howToWin:
      'Score the most points. A solved puzzle is worth 10 points, plus up to 5 more for speed, minus 3 for each hint you use and 2 for each wrong answer. An unsolved puzzle scores 0. Your total is every puzzle added up. When the session ends, the highest total wins. Teams tied on the top total win together.',
    rules: [
      'Players are put into teams when the game starts, either at random or by choosing (set in the lobby before Start). With 2 players each plays alone as a team of one; with 3 players it is a team of 2 against a team of 1.',
      'Teams take the stage one at a time. First comes a 10-second huddle: the team is shown 3 puzzle categories and each teammate taps one (most taps wins; ties and no taps are settled at random).',
      "Then everyone sees one puzzle with four possible answers. The team on stage has 90 seconds. Talk it over OUT LOUD with your team: only your team's Reader (a different teammate each round) can tap. Everyone else watches and may chat quietly, but please don't call out answers.",
      'The Reader can tap Hint (up to 2 times) or Give up. A wrong tap crosses that answer out.',
      'Scoring for a solved puzzle: 10 points, minus 3 per hint, minus 2 per wrong tap (never below 1), plus a speed bonus of up to 5 points for the time left. An unsolved puzzle (gave up or out of time) scores 0.',
      'After each puzzle the answer is shown for a few seconds. After every team has had a turn, the round ends and the scoreboard updates. Then there is a 60-second chat break with a conversation prompt (anyone can end it early), and a new round begins.',
      'Rounds keep going until there is not enough time left for another chat break and a full round. The highest total wins; teams tied on the top total win together.',
      'No round starts unless it can finish before the 60-minute session ends. If time does run out, the team on stage is not scored.',
    ],
  },
  'draw-and-guess': {
    players:
      'For 2 to 12 players, everyone for themselves. Everything is spoken out loud in the video room. No typing.',
    object:
      'One player draws a secret word on their phone while everyone else watches the picture appear and shouts out guesses, out loud. Take turns drawing so everyone gets a go.',
    howToWin:
      'Score the most points. Guess fast for 5, 3 or 2 points, and earn 2 points as the artist for every player who guesses your drawing. When the session ends, the highest total wins. Players tied on the top total win together.',
    rules: [
      '2 to 12 players can play, everyone for themselves. A round is every player drawing once, in a random order.',
      'The artist is shown 3 words and picks one (or asks for 3 new words, once). Nobody else sees the word. A word is picked for the artist if the 12 seconds run out.',
      'The artist draws on their phone for 60 seconds. No letters, numbers, talking or pointing! Everyone else watches the drawing appear and guesses OUT LOUD. No typing. The artist has six colors, three line widths, an Eraser to rub out part of the picture, Undo for the last line, and Clear to wipe the whole drawing and start over.',
      "When someone says the right answer, the artist taps that player's name. A guesser earns 5 points in the first third of the time, 3 in the second third and 2 in the last third. The artist earns 2 points for every player who guesses.",
      'The turn ends when everyone has guessed, the artist ends it, or the time runs out. The word is shown to everyone.',
      'After everyone has drawn once, there is a 60-second chat break with a conversation prompt (anyone can end it early), and a new round begins.',
      'Rounds keep going while a chat break and a full round fit before the 60-minute session ends, so everyone draws the same number of times. The highest total wins; players tied on the top total win together.',
    ],
  },
};

/** Games whose page is built (the rest show nothing extra in the live room yet). */
export const PLAYABLE: GameKey[] = ['invent-it', 'guess-whose-story', 'puzzle-room', 'draw-and-guess'];

// ---------- What the pages read ----------

export interface Player {
  id: string;
  name: string;
  team?: number | null;
  score?: number;
}

/** Fields every game's view has (Kelly's engines share this shape). */
export interface BaseView {
  phase: string;
  players: Player[];
  round: number;
  rounds: number;
  deadline: number;
  endsAt: number;
  log: string[];
  brk: { prompt: string } | null;
  ui: Record<string, unknown>;
}

export interface TeamRow {
  team: number;
  name: string;
  color: string;
  total: number;
  members: string[];
  rank: number;
}

/** What the team games (Invent It, Puzzle Room) share: teams made in the lobby, a category huddle, a team table. */
export interface TeamGameView extends BaseView {
  teamMode: 'random' | 'choose';
  teams: { name: string; color: string; total: number }[];
  order: number[];
  idx: number;
  /** turn -2 is the category huddle */
  stage: { team: number; turn: number; cats: number[] | null; votes: Record<string, number> } | null;
  winners: number[];
  ui: { board: TeamRow[]; catNames: string[]; catName: string | null; more: boolean | null };
}

export interface InventView extends TeamGameView {
  phase: 'lobby' | 'stage' | 'rate' | 'results' | 'break' | 'over';
  stage: {
    team: number;
    items: string[] | null;
    speakers: string[];
    turn: number;
    cats: number[] | null;
    votes: Record<string, number>;
    cat: number | null;
    spoke: number;
    passes: number;
    said: string[];
  } | null;
  rate: { team: number; votes: Record<string, number> } | null;
  roundData: Record<string, { items: string[]; avg: number; raters: number; speakers: string[]; passes: number }>;
  history: { round: number; teams: Record<string, { avg: number }>; partial?: boolean }[];
  ui: TeamGameView['ui'] & {
    speaker: string | null;
    role: 'start' | 'and' | 'name' | 'startname' | null;
    raters: string[];
  };
}

export interface PuzzleView extends TeamGameView {
  phase: 'lobby' | 'stage' | 'reveal' | 'results' | 'break' | 'over';
  /** the right answer never reaches the page */
  stage: {
    team: number;
    turn: number;
    cats: number[] | null;
    votes: Record<string, number>;
    cat: number | null;
    q: string | null;
    options: string[];
    crossed: number[];
    hints: number;
    shown: string[];
    reader: string | null;
  } | null;
  reveal: {
    team: number;
    q: string;
    answer: string;
    note: string;
    solved: boolean;
    points: number;
    bonus: number;
    hints: number;
    wrong: number;
    cat: string;
  } | null;
  roundData: Record<string, { q: string; answer: string; cat: string; solved: boolean; points: number }>;
  history: { round: number; teams: Record<string, { points: number }>; partial?: boolean }[];
  ui: TeamGameView['ui'] & { hintsLeft: number };
}

/** A player's row on the scoreboard of the everyone-for-themselves games. */
export interface PlayerRow {
  id: string;
  name: string;
  score: number;
  rank: number;
}

export interface StoryView extends BaseView {
  phase: 'lobby' | 'answer' | 'talk' | 'vote' | 'reveal' | 'results' | 'break' | 'over';
  /** question number in the round */
  n: number;
  cur: {
    cat: string;
    text: string;
    /** who: 3+ players guess the mystery person; spot: 2 players guess each other's answer */
    mode: 'who' | 'spot';
    part: string[];
    /** only your own until the reveal */
    yes: Record<string, boolean>;
    yesCount: number | null;
    mystery: string | null;
    isMystery?: boolean;
    votes: Record<string, string>;
    result: {
      mystery: string | null;
      right: string[];
      wrong: string[];
      none: string[];
      pts: Record<string, number>;
      yes: Record<string, boolean>;
    } | null;
  } | null;
  history: { round: number; pts: Record<string, number>; names: Record<string, string>; partial?: boolean }[];
  winners: string[];
  scored: boolean;
  ui: { board: PlayerRow[]; answered: number; guessed: number; voters: number; more: boolean | null };
}

/** One line of a drawing: colour (index into DRAW_COLORS, 6 = eraser), width (0 to 2), x,y pairs on a 1000 x 1000 square. */
export interface Stroke {
  c: number;
  w: number;
  p: number[];
}

export interface DrawRow extends PlayerRow {
  /** points earned on the latest turn */
  gain: number;
}

export interface DrawView extends BaseView {
  phase: 'lobby' | 'choose' | 'draw' | 'reveal' | 'break' | 'over';
  order: string[];
  idx: number;
  /** the word and the offered words only reach the artist (everyone else gets "?" and no options) */
  turn: {
    artist: string;
    options: { w: string; cat: string }[];
    rerolled: boolean;
    word: string | null;
    cat: string | null;
    start: number;
    guessed: { id: string; pts: number }[];
    strokes: Stroke[];
    live: Stroke | null;
    note: string;
  } | null;
  winners: string[];
  ui: { board: DrawRow[] };
}

// Kelly's drawing colours (DrawAndGuess.js COLORS); the last is the eraser, white drawn over the picture.
export const DRAW_COLORS = ['#111111', '#E4002B', '#0057E7', '#00A651', '#FF7A00', '#7B2CBF', '#FFFFFF'];
export const ERASER = 6;

// Kelly's six team colours (inventit.js TEAMS), for choosing a team in the lobby.
export const TEAMS = [
  { name: 'Red', color: '#E4002B' },
  { name: 'Blue', color: '#0057E7' },
  { name: 'Green', color: '#00A651' },
  { name: 'Orange', color: '#FF7A00' },
  { name: 'Purple', color: '#7B2CBF' },
  { name: 'Yellow', color: '#FFD500' },
];

/** Dark or light text on a team colour (Kelly's ink()). */
export function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150 ? '#111' : '#fff';
}

/** m:ss, rounded up like Kelly's pages. */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
