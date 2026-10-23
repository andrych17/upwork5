// Word Rush engine: tiles, scoring, word check and the House player. No DOM, so it also runs in Node (npm test).
import { WORDS } from "./words.js";

export var LIST = WORDS.split("\n");
var DICT = new Set(LIST);
export var BLOCKED = new Set([]); // add any words you do not want to allow, in lower case

export var COUNTS = { A: 9, B: 2, C: 3, D: 4, E: 12, F: 2, G: 3, H: 3, I: 8, J: 1, K: 1, L: 4, M: 3, N: 6, O: 8, P: 3, Q: 1, R: 6, S: 5, T: 6, U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1 };
export var VALUE = { A: 1, E: 1, I: 1, O: 1, U: 1, L: 1, N: 1, R: 1, S: 1, T: 1, D: 2, G: 2, M: 2, B: 3, C: 3, H: 3, P: 3, F: 4, V: 4, W: 4, Y: 4, K: 5, J: 7, X: 7, Q: 9, Z: 9 };
export var LENGTH_BONUS = { 2: 0, 3: 0, 4: 1, 5: 3, 6: 6, 7: 10 };
export var TRADE_COST = 2;
export var RACK_SIZE = 7;
export var LEVELS = {
  easy:   { min: 14, max: 22 },
  medium: { min: 9,  max: 15 },
  hard:   { min: 5,  max: 9 }
};

export function hashSeed(str) {
  var h = 1779033703 ^ str.length;
  for (var i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The house shuffles: an endless, repeatable stream of tiles. Same code, same stream.
export function TileStream(code) {
  this.rng = mulberry32(hashSeed(String(code)));
  this.queue = [];
  this.drawn = 0;
}
TileStream.prototype.refill = function () {
  var bag = [], L, i, j, t;
  for (L in COUNTS) for (i = 0; i < COUNTS[L]; i++) bag.push(L);
  for (i = bag.length - 1; i > 0; i--) {
    j = Math.floor(this.rng() * (i + 1));
    t = bag[i]; bag[i] = bag[j]; bag[j] = t;
  }
  this.queue = this.queue.concat(bag);
};
TileStream.prototype.next = function () {
  if (!this.queue.length) this.refill();
  this.drawn++;
  return this.queue.shift();
};

export function newPlayer(stream) {
  var rack = [];
  for (var i = 0; i < RACK_SIZE; i++) rack.push(stream.next());
  return { stream: stream, rack: rack, score: 0, played: {}, log: [], best: null };
}
export function scoreWord(word) {
  var s = 0, up = word.toUpperCase();
  for (var i = 0; i < up.length; i++) s += VALUE[up.charAt(i)] || 0;
  return s + (LENGTH_BONUS[word.length] || 0);
}
export function isValidWord(word) {
  return word.length >= 2 && DICT.has(word) && !BLOCKED.has(word);
}
export function canMake(rack, word) {
  var c = {}, i, ch;
  for (i = 0; i < rack.length; i++) c[rack[i]] = (c[rack[i]] || 0) + 1;
  var up = word.toUpperCase();
  for (i = 0; i < up.length; i++) {
    ch = up.charAt(i);
    if (!c[ch]) return false;
    c[ch]--;
  }
  return true;
}
// Play the tiles at these rack positions as a word. Returns {ok, reason, word, pts}.
export function playWord(player, idxs) {
  var word = "", i;
  for (i = 0; i < idxs.length; i++) word += player.rack[idxs[i]];
  word = word.toLowerCase();
  if (word.length < 2) return { ok: false, reason: "short", word: word };
  if (player.played[word]) return { ok: false, reason: "repeat", word: word };
  if (!isValidWord(word)) return { ok: false, reason: "invalid", word: word };
  var pts = scoreWord(word);
  player.score += pts;
  player.played[word] = true;
  player.log.unshift({ word: word, pts: pts });
  if (!player.best || pts > player.best.pts) player.best = { word: word, pts: pts };
  for (i = 0; i < idxs.length; i++) player.rack[idxs[i]] = player.stream.next();
  return { ok: true, word: word, pts: pts };
}
export function tradeTiles(player, idxs) {
  for (var i = 0; i < idxs.length; i++) player.rack[idxs[i]] = player.stream.next();
  player.score = Math.max(0, player.score - TRADE_COST);
}
// Every word the rack can make that this player has not played yet, best first.
export function findPlays(player) {
  var base = new Array(26).fill(0), i, w, k, ok, c, code, out = [];
  for (i = 0; i < player.rack.length; i++) base[player.rack[i].charCodeAt(0) - 65]++;
  for (w = 0; w < LIST.length; w++) {
    var word = LIST[w];
    if (word.length > player.rack.length || player.played[word] || BLOCKED.has(word)) continue;
    c = base.slice(); ok = true;
    for (k = 0; k < word.length; k++) {
      code = word.charCodeAt(k) - 97;
      if (--c[code] < 0) { ok = false; break; }
    }
    if (ok) out.push({ word: word, pts: scoreWord(word) });
  }
  out.sort(function (a, b) { return b.pts - a.pts; });
  return out;
}
function rackIndexesFor(rack, word) {
  var used = {}, idxs = [], up = word.toUpperCase(), i, j;
  for (i = 0; i < up.length; i++) {
    for (j = 0; j < rack.length; j++) {
      if (!used[j] && rack[j] === up.charAt(i)) { used[j] = true; idxs.push(j); break; }
    }
  }
  return idxs;
}
// The House plays the same deal at its own pace and never waits for you.
export function houseMove(house, level, rnd) {
  var plays = findPlays(house), pick;
  if (!plays.length) {
    var all = []; for (var i = 0; i < house.rack.length; i++) all.push(i);
    tradeTiles(house, all);
    return { traded: true };
  }
  if (level === "hard") pick = plays[Math.floor(rnd() * Math.min(3, plays.length))];
  else if (level === "medium") pick = plays[Math.floor(rnd() * Math.ceil(plays.length / 2))];
  else {
    var short = plays.filter(function (p) { return p.word.length <= 4; });
    var pool = short.length ? short : plays;
    pick = pool[Math.floor(rnd() * pool.length)];
  }
  var res = playWord(house, rackIndexesFor(house.rack, pick.word));
  return { traded: false, word: res.word, pts: res.pts };
}
