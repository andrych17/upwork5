// Word Rush engine: tiles, scoring, word check and the House player.
// No DOM or React, so it also runs straight in Node (npm test).
import { WORDS } from './words.ts';

export type Level = 'easy' | 'medium' | 'hard';

export interface Play {
  word: string;
  pts: number;
}

export interface Player {
  stream: TileStream;
  rack: string[];
  score: number;
  played: Set<string>;
  log: Play[];
  best: Play | null;
}

export type PlayResult =
  { ok: true; word: string; pts: number } | { ok: false; reason: 'short' | 'repeat' | 'invalid'; word: string };

export type HouseResult = { traded: true } | { traded: false; word: string; pts: number };

export const LIST: readonly string[] = WORDS.split('\n');
const DICT = new Set(LIST);
export const BLOCKED = new Set<string>([]); // add any words you do not want to allow, in lower case

const COUNTS: Record<string, number> = {
  A: 9,
  B: 2,
  C: 3,
  D: 4,
  E: 12,
  F: 2,
  G: 3,
  H: 3,
  I: 8,
  J: 1,
  K: 1,
  L: 4,
  M: 3,
  N: 6,
  O: 8,
  P: 3,
  Q: 1,
  R: 6,
  S: 5,
  T: 6,
  U: 4,
  V: 2,
  W: 2,
  X: 1,
  Y: 2,
  Z: 1,
};
export const VALUE: Record<string, number> = {
  A: 1,
  E: 1,
  I: 1,
  O: 1,
  U: 1,
  L: 1,
  N: 1,
  R: 1,
  S: 1,
  T: 1,
  D: 2,
  G: 2,
  M: 2,
  B: 3,
  C: 3,
  H: 3,
  P: 3,
  F: 4,
  V: 4,
  W: 4,
  Y: 4,
  K: 5,
  J: 7,
  X: 7,
  Q: 9,
  Z: 9,
};
const LENGTH_BONUS: Record<number, number> = { 2: 0, 3: 0, 4: 1, 5: 3, 6: 6, 7: 10 };
export const TRADE_COST = 2;
export const MIN_LENGTH = 3; // the board's rule: words of three letters or more
export const RACK_SIZE = 7;
// Seconds between House moves.
export const LEVELS: Record<Level, { min: number; max: number }> = {
  easy: { min: 14, max: 22 },
  medium: { min: 9, max: 15 },
  hard: { min: 5, max: 9 },
};

export function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The house shuffles: an endless, repeatable stream of tiles. Same code, same stream.
export class TileStream {
  private rng: () => number;
  private queue: string[] = [];

  constructor(code: string) {
    this.rng = mulberry32(hashSeed(code));
  }

  private refill(): void {
    const bag = Object.entries(COUNTS).flatMap(([letter, n]) => Array<string>(n).fill(letter));
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    this.queue = this.queue.concat(bag);
  }

  next(): string {
    if (!this.queue.length) this.refill();
    return this.queue.shift()!;
  }
}

export function newPlayer(stream: TileStream): Player {
  const rack = Array.from({ length: RACK_SIZE }, () => stream.next());
  return { stream, rack, score: 0, played: new Set(), log: [], best: null };
}

export function scoreWord(word: string): number {
  let s = 0;
  for (const ch of word.toUpperCase()) s += VALUE[ch] ?? 0;
  return s + (LENGTH_BONUS[word.length] ?? 0);
}

export function isValidWord(word: string): boolean {
  return word.length >= MIN_LENGTH && DICT.has(word) && !BLOCKED.has(word);
}

// Play the tiles at these rack positions as a word.
export function playWord(player: Player, idxs: readonly number[]): PlayResult {
  const word = idxs
    .map((i) => player.rack[i])
    .join('')
    .toLowerCase();
  if (word.length < MIN_LENGTH) return { ok: false, reason: 'short', word };
  if (player.played.has(word)) return { ok: false, reason: 'repeat', word };
  if (!isValidWord(word)) return { ok: false, reason: 'invalid', word };
  const pts = scoreWord(word);
  player.score += pts;
  player.played.add(word);
  player.log.unshift({ word, pts });
  if (!player.best || pts > player.best.pts) player.best = { word, pts };
  for (const i of idxs) player.rack[i] = player.stream.next();
  return { ok: true, word, pts };
}

export function tradeTiles(player: Player, idxs: readonly number[]): void {
  for (const i of idxs) player.rack[i] = player.stream.next();
  player.score = Math.max(0, player.score - TRADE_COST);
}

// Every word the rack can make that this player has not played yet, best first.
export function findPlays(player: Player): Play[] {
  const base = Array<number>(26).fill(0);
  for (const letter of player.rack) base[letter.charCodeAt(0) - 65] += 1;
  const out: Play[] = [];
  for (const word of LIST) {
    if (word.length < MIN_LENGTH || word.length > player.rack.length || player.played.has(word) || BLOCKED.has(word))
      continue;
    const left = base.slice();
    let ok = true;
    for (let k = 0; k < word.length; k++) {
      if (--left[word.charCodeAt(k) - 97] < 0) {
        ok = false;
        break;
      }
    }
    if (ok) out.push({ word, pts: scoreWord(word) });
  }
  return out.sort((a, b) => b.pts - a.pts);
}

function rackIndexesFor(rack: readonly string[], word: string): number[] {
  const used = new Set<number>();
  const idxs: number[] = [];
  for (const ch of word.toUpperCase()) {
    const j = rack.findIndex((letter, k) => !used.has(k) && letter === ch);
    if (j >= 0) {
      used.add(j);
      idxs.push(j);
    }
  }
  return idxs;
}

// The House plays the same deal at its own pace and never waits for you.
export function houseMove(house: Player, level: Level, rnd: () => number): HouseResult {
  const plays = findPlays(house);
  if (!plays.length) {
    tradeTiles(
      house,
      house.rack.map((_, i) => i),
    );
    return { traded: true };
  }
  let pick: Play;
  if (level === 'hard') pick = plays[Math.floor(rnd() * Math.min(3, plays.length))];
  else if (level === 'medium') pick = plays[Math.floor(rnd() * Math.ceil(plays.length / 2))];
  else {
    const short = plays.filter((p) => p.word.length <= 4);
    const pool = short.length ? short : plays;
    pick = pool[Math.floor(rnd() * pool.length)];
  }
  const res = playWord(house, rackIndexesFor(house.rack, pick.word));
  return res.ok ? { traded: false, word: res.word, pts: res.pts } : { traded: true };
}
