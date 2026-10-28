// Checks the Word Rush engine without a browser: npm test (Node runs the TypeScript directly)
import assert from 'node:assert/strict';
import {
  LIST,
  MIN_LENGTH,
  RACK_SIZE,
  TRADE_COST,
  TileStream,
  findPlays,
  houseMove,
  isValidWord,
  newPlayer,
  playWord,
  scoreWord,
  tradeTiles,
} from '../lib/word-rush/engine.ts';

// Same deal code, same tiles in the same order (friends compare scores this way).
const a = newPlayer(new TileStream('ABCDE'));
const b = newPlayer(new TileStream('ABCDE'));
assert.deepEqual(a.rack, b.rack);
assert.equal(a.rack.length, RACK_SIZE);
assert.notDeepEqual(newPlayer(new TileStream('ZZZZZ')).rack, a.rack);

assert.ok(LIST.length > 30000);
assert.ok(isValidWord('cat'));
assert.ok(!isValidWord('qzx'));
assert.ok(!isValidWord('at')); // the board asks for three letters or more
assert.equal(scoreWord('cat'), 5); // C3 + A1 + T1, no bonus under 4 letters
assert.equal(scoreWord('quiz'), 9 + 1 + 1 + 9 + 1); // plus the 4-letter bonus

// Play the best word the rack can make, then the same word again.
const p = newPlayer(new TileStream('TEST1'));
const best = findPlays(p)[0];
assert.ok(best, 'rack should make at least one word');
const idxs: number[] = [];
for (const ch of best.word.toUpperCase()) idxs.push(p.rack.findIndex((l, i) => l === ch && !idxs.includes(i)));
const ok = playWord(p, idxs);
assert.equal(ok.ok, true);
assert.equal(p.score, best.pts);
assert.equal(p.rack.length, RACK_SIZE);
const short = playWord(p, [0, 1]);
assert.ok(!short.ok && short.reason === 'short');
assert.ok(findPlays(p).every((x) => x.word.length >= MIN_LENGTH));

// Trading costs points but never drops the score below zero.
const t = newPlayer(new TileStream('TRADE'));
tradeTiles(t, [0, 1]);
assert.equal(t.score, 0);
t.score = 5;
tradeTiles(t, [0]);
assert.equal(t.score, 5 - TRADE_COST);

// The House always moves: a word, or a trade when it has none.
const h = newPlayer(new TileStream('HOUSE'));
const move = houseMove(h, 'hard', () => 0);
assert.ok(move.traded || (move.pts > 0 && h.played.has(move.word)));

console.log('engine ok');
