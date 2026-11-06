// Checks that the live room draws the same board as Kelly's engine (the server runs the rules): npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  ANSWER_SECONDS,
  AWAY_AFTER_MISSES,
  BADGE_BONUS,
  MAX_PAUSE_SECONDS,
  MAX_PLAYERS,
  POINTS_PER_RIGHT,
  SPINNER_MAX,
  TRIVIA_RULES,
  board,
  clockLeft,
  inkOn,
  newer,
  roomCategories,
  scoreboard,
  wheelAfter,
  type TriviaPlayer,
  type TriviaState,
} from '../lib/trivia.ts';

// The engine is a browser/Deno script (package.json makes .js files ES modules here), so run it as a plain script.
const sandbox: {
  MeetDoTrivia?: {
    board(nCats: number): unknown[];
    scoreboard(state: unknown): Record<string, unknown>[];
    DEFAULT_CONFIG: Record<string, number>;
  };
} = {};
runInNewContext(readFileSync(new URL('../supabase/functions/_shared/trivia.js', import.meta.url), 'utf8'), sandbox);
const engine = sandbox.MeetDoTrivia!;

for (let n = 2; n <= 12; n++)
  assert.deepEqual(board(n), JSON.parse(JSON.stringify(engine.board(n))), `board with ${n} categories`); // plain objects across the vm realm

const cats = ['geo', 'hist', 'sci'].map((id) => ({ id, name: id, color: '#000000' }));
assert.deepEqual(
  roomCategories(cats, []).map((c) => c.id),
  ['geo', 'hist', 'sci'],
);
assert.deepEqual(
  roomCategories(cats, ['sci', 'geo']).map((c) => c.id),
  ['geo', 'sci'],
  'bank order, like view()',
);
assert.deepEqual(roomCategories(cats, ['gone']).length, 3, 'unknown theme falls back to all, like view()');

// The pointer sits over segment n after every spin, whatever the wheel showed before.
let deg = 0;
for (const n of [3, 3, 1, 6, 2]) {
  const next = wheelAfter(deg, n);
  assert.ok(next - deg >= 1080 && next - deg < 1440, 'three full turns plus less than one');
  assert.equal((((next + (n - 1) * 60 + 30) % 360) + 360) % 360, 0, `segment ${n} under the pointer`);
  deg = next;
}

const q = (running: boolean) =>
  ({
    phase: 'question',
    deadline: 10_000,
    q: { clock: { total: 60_000, left: 25_000, running, since: 0, pausedAt: 4_000, pausedUsed: 10_000 } },
  }) as unknown as TriviaState;
assert.equal(clockLeft(q(true), 4_000)?.left, 6_000, 'running sand counts to the deadline');
assert.equal(clockLeft(q(true), 99_000)?.left, 0, 'never below zero');
assert.equal(clockLeft(q(false), 9_000)?.left, 25_000, 'stopped sand keeps its time');
assert.equal(clockLeft(q(false), 9_000)?.pauseLeft, 45_000, 'stopped time allowance shrinks while stopped');
assert.equal(clockLeft({ ...q(true), phase: 'spin' }, 0), null, 'no hourglass outside a question');

const snap = (rev: number) => ({ rev, card: null, state: q(true) });
assert.ok(newer(null, snap(0)) && newer(snap(1), snap(2)) && !newer(snap(2), snap(2)) && !newer(snap(3), snap(2)));

// Kelly 6 Nov: the rules and scoreboard the page shows follow her engine's settings and ranking.
const cfg = engine.DEFAULT_CONFIG;
assert.deepEqual(
  [MAX_PLAYERS, SPINNER_MAX, ANSWER_SECONDS, POINTS_PER_RIGHT, BADGE_BONUS, MAX_PAUSE_SECONDS, AWAY_AFTER_MISSES],
  [
    cfg.maxPlayers,
    cfg.spinnerMax,
    cfg.answerSeconds,
    cfg.pointsPerRight,
    cfg.badgeBonus,
    cfg.maxPauseSeconds,
    cfg.awayAfterMisses,
  ],
  'rules text uses the engine settings',
);
assert.equal(TRIVIA_RULES.length, 8);
const player = (
  id: string,
  points: number | undefined,
  right: number,
  asked: number,
  badges: boolean[],
  away = false,
) => ({ id, name: id, pos: 0, color: 0, misses: 0, away, right, asked, points, badges }) as TriviaPlayer;
const scored = {
  players: [
    player('a', 5, 3, 6, [true, false, false]),
    player('b', 7, 5, 6, [true, false, false]),
    player('c', 5, 3, 4, [true, false, false]), // same score and badges as a, better accuracy: ranked above, same rank
    player('d', 5, 1, 2, [true, true, false], true),
    player('e', undefined, 0, 0, [false, false, false]),
  ],
};
const mine = scoreboard(scored);
const theirs = JSON.parse(JSON.stringify(engine.scoreboard(scored))) as Record<string, unknown>[];
assert.deepEqual(
  mine,
  theirs.map((row) => {
    const copy = { ...row };
    delete copy.accuracy; // only her engine keeps the tie-break number on the row
    return copy;
  }),
  'same order, ranks and numbers as her engine',
);
assert.deepEqual(
  mine.map((r) => `${r.id}${r.rank}`),
  ['b1', 'd2', 'c3', 'a3', 'e5'],
);
assert.equal(inkOn('#FFD500'), '#111', 'dark letters on her yellow');
assert.equal(inkOn('#0057E7'), '#fff', 'white letters on her blue');
assert.equal(inkOn('nonsense'), '#fff');

// prettier-plugin-tailwindcss trims the space in `trivia-turn${me ? ' me' : ''}`, gluing the two class names together
// (it happened once and unstyled the turn banner). Whole-string ternaries survive formatting.
const room = readFileSync(new URL('../components/games/trivia-room.tsx', import.meta.url), 'utf8');
assert.ok(!/className=\{`[^`]*[\w-]\$\{[^}]*\?\s*'\w/.test(room), 'no class name glued to a conditional one');
assert.ok(
  room.includes("'trivia-turn me'") && room.includes("'trivia-player now'") && room.includes("'trivia-pip on'"),
);

console.log('trivia: ok');
