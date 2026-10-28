// The computer player for Slow Chess: a small alpha-beta search over the engine's legal moves.
// Easy looks one move ahead and often settles for a weaker move, Medium looks two moves ahead, Hard three.
import { apply, inCheck, legal, type AiLevel, type Move, type State } from './engine.ts';

const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MATE = 100_000;
const SETTINGS: Record<AiLevel, { depth: number; margin: number }> = {
  easy: { depth: 1, margin: 150 },
  medium: { depth: 2, margin: 30 },
  hard: { depth: 3, margin: 0 },
};

// A small bonus for central pieces and advanced pawns, so quiet positions still have a plan.
function placement(t: string, sq: number, white: boolean): number {
  const r = Math.floor(sq / 8);
  const c = sq % 8;
  const centre = 3.5 - Math.max(Math.abs(r - 3.5), Math.abs(c - 3.5)); // 0.5 on the edge, 3.5 in the middle
  if (t === 'p') return (white ? 6 - r : r - 1) * (c >= 2 && c <= 5 ? 8 : 5);
  if (t === 'n' || t === 'b') return centre * 10;
  if (t === 'q') return centre * 3;
  return 0;
}

/** Score in centipawns from the point of view of the side to move. */
export function evaluate(s: State): number {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = s.b[i];
    if (!p) continue;
    const white = p === p.toUpperCase();
    const t = p.toLowerCase();
    const v = VALUE[t]! + placement(t, i, white);
    score += white ? v : -v;
  }
  return s.turn === 'w' ? score : -score;
}

// Big captures and promotions first, so alpha-beta cuts more of the tree.
function ordered(s: State, moves: Move[]): Move[] {
  const gain = (m: Move) =>
    (s.b[m.to] ? VALUE[s.b[m.to]!.toLowerCase()]! * 10 - VALUE[s.b[m.from]!.toLowerCase()]! : 0) + (m.promo ? 8000 : 0);
  return moves.slice().sort((a, b) => gain(b) - gain(a));
}

function search(s: State, depth: number, alpha: number, beta: number, ply: number): number {
  if (depth === 0) return evaluate(s);
  const moves = legal(s);
  // Mated sooner is worse, so the computer takes the fastest mate and delays its own.
  if (!moves.length) return inCheck(s, s.turn) ? -MATE + ply : 0;
  for (const m of ordered(s, moves)) {
    const score = -search(apply(s, m), depth - 1, -beta, -alpha, ply + 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

/** The computer's move for the side to move, or null when the game is over. */
export function bestMove(s: State, level: AiLevel, rnd: () => number = Math.random): Move | null {
  const moves = legal(s);
  if (!moves.length) return null;
  const { depth, margin } = SETTINGS[level];
  // Each root move gets a full window, so the margin compares real scores rather than bounds.
  const scored = ordered(s, moves).map((m) => ({ m, score: -search(apply(s, m), depth - 1, -MATE * 2, MATE * 2, 1) }));
  const top = Math.max(...scored.map((x) => x.score));
  const pool = scored.filter((x) => x.score >= top - margin);
  return pool[Math.floor(rnd() * pool.length)]!.m;
}
