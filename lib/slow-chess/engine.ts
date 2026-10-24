// Slow Chess rules, ported from chess.html. The whole game lives in the link (#g=…&w=…&b=…&m=…),
// so nothing is stored on a server: replay() rebuilds the position from the move list every time.
//
// Board: 64 squares, index = row * 8 + col, row 0 is rank 8. White pieces are upper case, black lower case,
// '' is empty.

export type Color = 'w' | 'b';
export type Flag = '' | 'dbl' | 'ep' | 'oo' | 'ooo';
export interface Move {
  from: number;
  to: number;
  /** promotion piece, lower case: q, r, b or n */
  promo: string;
  flag: Flag;
}
export interface State {
  b: string[];
  turn: Color;
  /** castling rights */
  c: { K: boolean; Q: boolean; k: boolean; q: boolean };
  /** en passant target square, -1 if none */
  ep: number;
  half: number;
  full: number;
}
export interface Replay {
  state: State;
  legal: Move[];
  hist: { from: number; to: number }[];
  sans: string[];
  /** '' while playing, 'w' or 'b' for the winner, 'd' for a draw */
  over: '' | Color | 'd';
  why: string;
  check: boolean;
}

const START = 'rnbqkbnrpppppppp' + ' '.repeat(32) + 'PPPPPPPPRNBQKBNR';
const FILES = 'abcdefgh';
const KN = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
] as const;
const KG = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
] as const;
const DG = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const;
const ST = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;
const onBoard = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
const other = (col: Color): Color => (col === 'w' ? 'b' : 'w');

export function initial(): State {
  return {
    b: [...START].map((ch) => (ch === ' ' ? '' : ch)),
    turn: 'w',
    c: { K: true, Q: true, k: true, q: true },
    ep: -1,
    half: 0,
    full: 1,
  };
}
const copy = (s: State): State => ({ ...s, b: s.b.slice(), c: { ...s.c } });
export const colorOf = (p: string): Color | '' => (p === '' ? '' : p === p.toUpperCase() ? 'w' : 'b');
export const sqName = (i: number) => FILES.charAt(i % 8) + (8 - Math.floor(i / 8));
export const sqIndex = (n: string) => (8 - parseInt(n.charAt(1), 10)) * 8 + FILES.indexOf(n.charAt(0));

export function attacked(s: State, sq: number, by: Color): boolean {
  const b = s.b;
  const r = Math.floor(sq / 8);
  const c = sq % 8;
  const up = (p: string) => (by === 'w' ? p.toUpperCase() : p);
  // A white pawn attacks upward, so it sits on the row below.
  const pr = by === 'w' ? r + 1 : r - 1;
  for (const d of [-1, 1]) if (onBoard(pr, c + d) && b[pr * 8 + c + d] === up('p')) return true;
  for (let i = 0; i < 8; i++) {
    const [nr, nc] = [r + KN[i]![0], c + KN[i]![1]];
    if (onBoard(nr, nc) && b[nr * 8 + nc] === up('n')) return true;
    const [kr, kc] = [r + KG[i]![0], c + KG[i]![1]];
    if (onBoard(kr, kc) && b[kr * 8 + kc] === up('k')) return true;
  }
  const slide = (dirs: readonly (readonly [number, number])[], piece: string) =>
    dirs.some(([dr, dc]) => {
      for (let rr = r + dr, cc = c + dc; onBoard(rr, cc); rr += dr, cc += dc) {
        const p = b[rr * 8 + cc];
        if (p) return p === up(piece) || p === up('q');
      }
      return false;
    });
  return slide(DG, 'b') || slide(ST, 'r');
}
export const kingSq = (s: State, col: Color) => s.b.indexOf(col === 'w' ? 'K' : 'k');
export const inCheck = (s: State, col: Color) => attacked(s, kingSq(s, col), other(col));

function pseudo(s: State): Move[] {
  const out: Move[] = [];
  const b = s.b;
  const me = s.turn;
  const foe = other(me);
  const add = (from: number, to: number, promo = '', flag: Flag = '') => out.push({ from, to, promo, flag });
  const addPromos = (from: number, to: number) => {
    for (const x of 'qrbn') add(from, to, x);
  };
  for (let i = 0; i < 64; i++) {
    const p = b[i]!;
    if (!p || colorOf(p) !== me) continue;
    const r = Math.floor(i / 8);
    const c = i % 8;
    const t = p.toLowerCase();
    if (t === 'p') {
      const dir = me === 'w' ? -1 : 1;
      const startRow = me === 'w' ? 6 : 1;
      const promoRow = me === 'w' ? 0 : 7;
      const rr = r + dir;
      if (rr >= 0 && rr < 8 && !b[rr * 8 + c]) {
        if (rr === promoRow) addPromos(i, rr * 8 + c);
        else {
          add(i, rr * 8 + c);
          if (r === startRow && !b[(r + 2 * dir) * 8 + c]) add(i, (r + 2 * dir) * 8 + c, '', 'dbl');
        }
      }
      for (const d of [-1, 1]) {
        const cc = c + d;
        if (!onBoard(rr, cc)) continue;
        const q = rr * 8 + cc;
        if (b[q] && colorOf(b[q]!) === foe) {
          if (rr === promoRow) addPromos(i, q);
          else add(i, q);
        } else if (q === s.ep) add(i, q, '', 'ep');
      }
    } else if (t === 'n' || t === 'k') {
      for (const [dr, dc] of t === 'n' ? KN : KG) {
        const rr = r + dr;
        const cc = c + dc;
        if (!onBoard(rr, cc)) continue;
        const q = rr * 8 + cc;
        if (!b[q] || colorOf(b[q]!) === foe) add(i, q);
      }
      const home = me === 'w' ? 60 : 4;
      if (t === 'k' && i === home && !inCheck(s, me)) {
        const rook = me === 'w' ? 'R' : 'r';
        const kingSide = me === 'w' ? s.c.K : s.c.k;
        const queenSide = me === 'w' ? s.c.Q : s.c.q;
        if (
          kingSide &&
          b[home + 3] === rook &&
          !b[home + 1] &&
          !b[home + 2] &&
          !attacked(s, home + 1, foe) &&
          !attacked(s, home + 2, foe)
        )
          add(i, home + 2, '', 'oo');
        if (
          queenSide &&
          b[home - 4] === rook &&
          !b[home - 1] &&
          !b[home - 2] &&
          !b[home - 3] &&
          !attacked(s, home - 1, foe) &&
          !attacked(s, home - 2, foe)
        )
          add(i, home - 2, '', 'ooo');
      }
    } else {
      const dirs = t === 'b' ? DG : t === 'r' ? ST : [...DG, ...ST];
      for (const [dr, dc] of dirs) {
        for (let rr = r + dr, cc = c + dc; onBoard(rr, cc); rr += dr, cc += dc) {
          const q = rr * 8 + cc;
          if (!b[q]) add(i, q);
          else {
            if (colorOf(b[q]!) === foe) add(i, q);
            break;
          }
        }
      }
    }
  }
  return out;
}

export function apply(s: State, m: Move): State {
  const n = copy(s);
  const p = n.b[m.from]!;
  const me = s.turn;
  const cap = n.b[m.to] !== '' || m.flag === 'ep';
  n.b[m.to] = m.promo ? (me === 'w' ? m.promo.toUpperCase() : m.promo) : p;
  n.b[m.from] = '';
  if (m.flag === 'ep') n.b[m.to + (me === 'w' ? 8 : -8)] = '';
  if (m.flag === 'oo') {
    n.b[m.to - 1] = n.b[m.to + 1]!;
    n.b[m.to + 1] = '';
  }
  if (m.flag === 'ooo') {
    n.b[m.to + 1] = n.b[m.to - 2]!;
    n.b[m.to - 2] = '';
  }
  n.ep = m.flag === 'dbl' ? (m.from + m.to) / 2 : -1;
  if (p === 'K') n.c.K = n.c.Q = false;
  if (p === 'k') n.c.k = n.c.q = false;
  // A rook that moves or is captured loses its castling right.
  if (m.from === 63 || m.to === 63) n.c.K = false;
  if (m.from === 56 || m.to === 56) n.c.Q = false;
  if (m.from === 7 || m.to === 7) n.c.k = false;
  if (m.from === 0 || m.to === 0) n.c.q = false;
  n.half = p.toLowerCase() === 'p' || cap ? 0 : s.half + 1;
  if (me === 'b') n.full++;
  n.turn = other(me);
  return n;
}

export const legal = (s: State): Move[] => pseudo(s).filter((m) => !inCheck(apply(s, m), s.turn));
export const uci = (m: Move) => sqName(m.from) + sqName(m.to) + m.promo;
export const findMove = (s: State, str: string) => legal(s).find((m) => uci(m) === str) ?? null;

export function perft(s: State, depth: number): number {
  if (depth === 0) return 1;
  const moves = legal(s);
  if (depth === 1) return moves.length;
  return moves.reduce((n, m) => n + perft(apply(s, m), depth - 1), 0);
}

export function fromFen(fen: string): State {
  const [board = '', turn, castling = '-', ep = '-', half, full] = fen.split(' ');
  const s: State = {
    b: [],
    turn: turn === 'b' ? 'b' : 'w',
    c: { K: false, Q: false, k: false, q: false },
    ep: -1,
    half: Number(half) || 0,
    full: Number(full) || 1,
  };
  for (const ch of board) {
    if (ch === '/') continue;
    if (/\d/.test(ch)) s.b.push(...Array<string>(Number(ch)).fill(''));
    else s.b.push(ch);
  }
  if (castling !== '-') for (const x of castling) if (x in s.c) s.c[x as keyof State['c']] = true;
  if (ep !== '-') s.ep = sqIndex(ep);
  return s;
}

/** Position key for the repetition rule. En passant only counts when a capture is really possible. */
function posKey(s: State): string {
  const ep = s.ep >= 0 && pseudo(s).some((m) => m.flag === 'ep') ? s.ep : -1;
  const c = (s.c.K ? 'K' : '') + (s.c.Q ? 'Q' : '') + (s.c.k ? 'k' : '') + (s.c.q ? 'q' : '');
  return s.b.join('|') + s.turn + c + ep;
}

function insufficient(s: State): boolean {
  const minors: { t: string; sq: number }[] = [];
  for (let i = 0; i < 64; i++) {
    const p = s.b[i];
    if (!p) continue;
    const t = p.toLowerCase();
    if (t === 'k') continue;
    if (t === 'p' || t === 'r' || t === 'q') return false;
    minors.push({ t, sq: i });
  }
  if (minors.length <= 1) return true;
  // Bishops only, all on the same square color.
  const shade = (m: { sq: number }) => (Math.floor(m.sq / 8) + (m.sq % 8)) % 2;
  return minors.every((m) => m.t === 'b' && shade(m) === shade(minors[0]!));
}

const LETTER: Record<string, string> = { p: '', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };

export function san(s: State, m: Move): string {
  const p = s.b[m.from]!;
  const t = p.toLowerCase();
  const cap = s.b[m.to] !== '' || m.flag === 'ep';
  let out = '';
  if (m.flag === 'oo') out = 'O-O';
  else if (m.flag === 'ooo') out = 'O-O-O';
  else {
    if (t === 'p') {
      if (cap) out += sqName(m.from).charAt(0);
    } else {
      out += LETTER[t];
      const others = legal(s).filter((x) => x.to === m.to && x.from !== m.from && s.b[x.from] === p);
      if (others.length) {
        const sameFile = others.some((x) => x.from % 8 === m.from % 8);
        const sameRank = others.some((x) => Math.floor(x.from / 8) === Math.floor(m.from / 8));
        if (!sameFile) out += sqName(m.from).charAt(0);
        else if (!sameRank) out += sqName(m.from).charAt(1);
        else out += sqName(m.from);
      }
    }
    if (cap) out += 'x';
    out += sqName(m.to);
    if (m.promo) out += '=' + m.promo.toUpperCase();
  }
  const n = apply(s, m);
  if (inCheck(n, n.turn)) out += legal(n).length ? '+' : '#';
  return out;
}

/** Replay a list of tokens: moves like "e2e4", or "r" for a resign by the side to move. */
export function replay(tokens: readonly string[]): Replay | { error: string } {
  let s = initial();
  const seen = new Map([[posKey(s), 1]]);
  const hist: Replay['hist'] = [];
  const sans: string[] = [];
  let resigned: Color | '' = '';
  for (const token of tokens) {
    if (token === 'r') {
      resigned = s.turn;
      break;
    }
    const m = findMove(s, token);
    if (!m) return { error: `Bad move in link: ${token}` };
    sans.push(san(s, m));
    hist.push({ from: m.from, to: m.to });
    s = apply(s, m);
    const k = posKey(s);
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const moves = legal(s);
  let over: Replay['over'] = '';
  let why = '';
  if (resigned) {
    over = other(resigned);
    why = `${resigned === 'w' ? 'White' : 'Black'} resigned`;
  } else if (!moves.length) {
    if (inCheck(s, s.turn)) {
      over = other(s.turn);
      why = 'Checkmate';
    } else {
      over = 'd';
      why = 'Stalemate';
    }
  } else if (insufficient(s)) {
    over = 'd';
    why = 'Draw: not enough pieces to checkmate';
  } else if ((seen.get(posKey(s)) ?? 0) >= 3) {
    over = 'd';
    why = 'Draw: same position three times';
  } else if (s.half >= 100) {
    over = 'd';
    why = 'Draw: 50 moves with no capture or pawn move';
  }
  return { state: s, legal: moves, hist, sans, over, why, check: !over && inCheck(s, s.turn) };
}

/* ---------- the game link ---------- */

export interface GameRef {
  id: string;
  w: string;
  b: string;
  tokens: string[];
}

/** Player names: letters, digits, space and . ' - only, up to 20 characters. */
export function cleanName(x: unknown, fallback: string): string {
  const name = String(x ?? '')
    .replace(/[^\w .'-]/g, '')
    .trim()
    .slice(0, 20);
  return name || fallback;
}

export function newId(random: () => number = Math.random): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 6 }, () => chars.charAt(Math.floor(random() * chars.length))).join('');
}

export const gameHash = (g: GameRef) =>
  `#g=${g.id}&w=${encodeURIComponent(g.w)}&b=${encodeURIComponent(g.b)}&m=${g.tokens.join('.')}`;

/** Reads a game link hash. Returns null if it isn't one. */
export function parseGameHash(hash: string): GameRef | null {
  const o: Record<string, string> = {};
  for (const kv of hash.replace(/^#/, '').split('&')) {
    const i = kv.indexOf('=');
    if (i <= 0) continue;
    try {
      o[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
    } catch {
      return null; // a link cut off in the middle of %xx
    }
  }
  if (!o.g) return null;
  return {
    id: o.g.replace(/[^a-z0-9]/gi, '').slice(0, 12),
    w: cleanName(o.w, 'White'),
    b: cleanName(o.b, 'Black'),
    tokens: o.m ? o.m.split('.').filter(Boolean) : [],
  };
}
