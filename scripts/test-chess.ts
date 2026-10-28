// Checks the Slow Chess engine without a browser: npm test (Node runs the TypeScript directly)
import assert from 'node:assert/strict';
import { bestMove } from '../lib/slow-chess/computer.ts';
import {
  AI_LEVELS,
  apply,
  fromFen,
  gameHash,
  initial,
  legal,
  parseGameHash,
  perft,
  replay,
  uci,
  type Replay,
} from '../lib/slow-chess/engine.ts';

function game(tokens: string[]): Replay {
  const r = replay(tokens);
  assert.ok(!('error' in r), 'error' in r ? r.error : '');
  return r as Replay;
}

// Move counts from the standard perft positions (chessprogramming.org/Perft_Results).
assert.equal(perft(initial(), 3), 8902);
const kiwipete = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
assert.equal(perft(kiwipete, 2), 2039);
assert.equal(perft(kiwipete, 3), 97862);
assert.equal(perft(fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'), 4), 43238); // en passant and pins

// Fool's mate.
const mate = game(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
assert.equal(mate.over, 'b');
assert.equal(mate.why, 'Checkmate');
assert.deepEqual(mate.sans, ['f3', 'e5', 'g4', 'Qh4#']);

// Castling and en passant in notation.
const sans = game(['e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6', 'a6a5', 'g1f3', 'a5a4', 'f1e2', 'a4a3', 'e1g1']).sans;
assert.equal(sans[4], 'exd6');
assert.equal(sans.at(-1), 'O-O');

// Resign, a bad move in a link, and repetition.
const resigned = game(['e2e4', 'r']);
assert.equal(resigned.over, 'w');
assert.equal(resigned.why, 'Black resigned');
assert.ok('error' in replay(['e2e5']));
const knights = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
assert.equal(game([...knights, ...knights]).over, 'd');

// The link keeps the game, and odd input stays safe.
const ref = { id: 'abc234', w: "Jo O'Neil", b: 'Sam', tokens: ['e2e4', 'e7e5'] };
assert.deepEqual(parseGameHash(gameHash(ref)), ref);
assert.deepEqual(parseGameHash('#g=x1&w=%3Cscript%3E&b=&m='), { id: 'x1', w: 'script', b: 'Black', tokens: [] });
assert.equal(parseGameHash('#g=x1&w=%E0%A4%A'), null);
assert.equal(parseGameHash('#w=Sam'), null);
const vsComputer = { id: 'cpu234', w: 'You', b: 'Computer', tokens: ['e2e4'], ai: 'hard' as const };
assert.deepEqual(parseGameHash(gameHash(vsComputer)), vsComputer);
assert.equal(parseGameHash('#g=x1&ai=godlike')?.ai, undefined);

// The computer: always a legal move, takes a mate in one, and grabs a free queen.
const start = initial();
for (const level of AI_LEVELS) {
  const m = bestMove(start, level);
  assert.ok(m && legal(start).some((x) => uci(x) === uci(m)), level);
}
const scholar = game(['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6']).state;
for (const level of ['medium', 'hard'] as const) assert.equal(uci(bestMove(scholar, level, () => 0)!), 'h5f7', level);
const freeQueen = fromFen('rnb1kbnr/pppp1ppp/8/8/3qP3/2N5/PPP2PPP/R1BQKBNR w KQkq - 0 4');
for (const level of AI_LEVELS) assert.equal(uci(bestMove(freeQueen, level, () => 0)!), 'd1d4', level);
assert.equal(bestMove(game(['f2f3', 'e7e5', 'g2g4', 'd8h4']).state, 'hard'), null);

// Hard has to answer within a moment, even in a busy middlegame.
const busy = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
const t0 = performance.now();
const reply = bestMove(busy, 'hard')!;
const ms = performance.now() - t0;
assert.ok(ms < 1500, `hard took ${Math.round(ms)} ms`);
apply(busy, reply);
console.log(`hard move in a busy position: ${Math.round(ms)} ms`);

console.log('chess ok');
