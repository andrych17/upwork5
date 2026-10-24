// Checks the Slow Chess engine without a browser: npm test (Node runs the TypeScript directly)
import assert from 'node:assert/strict';
import { fromFen, gameHash, initial, parseGameHash, perft, replay, type Replay } from '../lib/slow-chess/engine.ts';

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

console.log('chess ok');
