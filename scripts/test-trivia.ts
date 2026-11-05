// Checks that the live room draws the same board as Kelly's engine (the server runs the rules): npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { board, clockLeft, newer, roomCategories, wheelAfter, type TriviaState } from '../lib/trivia.ts';

// The engine is a browser/Deno script (package.json makes .js files ES modules here), so run it as a plain script.
const sandbox: { MeetDoTrivia?: { board(nCats: number): unknown[] } } = {};
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

console.log('trivia: ok');
