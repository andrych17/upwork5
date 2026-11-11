'use client';

// The drawing square of Draw and Guess (Kelly's DrawAndGuess.html canvas, same maths): lines are colour + width + x,y
// pairs on a 1000 x 1000 grid, so every screen size draws the same picture. The artist draws with a finger or mouse;
// everyone else just sees the lines the server has.
import { type PointerEvent, useCallback, useEffect, useRef } from 'react';
import { DRAW_COLORS, ERASER, type Stroke } from '@/lib/live-games';

// Line width as a share of the square: thin, medium, thick. The eraser is a wider white line.
const WIDTHS = [0.007, 0.016, 0.034];
const ERASER_WIDER = 2.2;
// The engine allows 800 points in one line; a longer scribble carries on in a new line.
const MAX_POINTS = 800;
// Points closer than this (in grid units) add nothing.
const MIN_STEP = 3;

function paintStroke(g: CanvasRenderingContext2D, st: Stroke, size: number) {
  const colour = DRAW_COLORS[st.c];
  const width = WIDTHS[st.w];
  if (!colour || width === undefined || st.p.length < 2) return;
  const px = width * size * (st.c === ERASER ? ERASER_WIDER : 1);
  const k = size / 1000;
  g.strokeStyle = colour;
  g.fillStyle = colour;
  g.lineWidth = px;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  if (st.p.length === 2) {
    g.arc(st.p[0] * k, st.p[1] * k, px / 2, 0, Math.PI * 2);
    g.fill();
    return;
  }
  g.moveTo(st.p[0] * k, st.p[1] * k);
  for (let i = 2; i + 1 < st.p.length; i += 2) g.lineTo(st.p[i] * k, st.p[i + 1] * k);
  g.stroke();
}

const clamp = (n: number) => Math.max(0, Math.min(1000, Math.round(n)));
const copy = (st: Stroke): Stroke => ({ c: st.c, w: st.w, p: [...st.p] });

export interface PadTool {
  color: number;
  width: number;
  /** the line so far, while the finger is still down (the page throttles these) */
  onLive: (st: Stroke) => void;
  /** a finished line */
  onStroke: (st: Stroke) => void;
}

interface Props {
  strokes: Stroke[];
  /** the artist's line in progress, for everyone but the artist */
  live: Stroke | null;
  /** only the artist, while drawing */
  tool?: PadTool;
}

export default function DrawPad({ strokes, live, tool }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const cur = useRef<Stroke | null>(null);
  const shown = useRef({ strokes, live });

  const paint = useCallback(() => {
    const cv = canvas.current;
    const g = cv?.getContext('2d');
    if (!cv || !g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = Math.max(200, Math.round(cv.getBoundingClientRect().width * dpr));
    if (cv.width !== size) {
      cv.width = size;
      cv.height = size;
    }
    g.fillStyle = '#fff';
    g.fillRect(0, 0, size, size);
    for (const st of shown.current.strokes) paintStroke(g, st, size);
    const extra = cur.current ?? shown.current.live;
    if (extra) paintStroke(g, extra, size);
  }, []);

  useEffect(() => {
    shown.current = { strokes, live };
    paint();
  }, [strokes, live, paint]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const watch = new ResizeObserver(paint);
    watch.observe(cv);
    return () => watch.disconnect();
  }, [paint]);

  const at = (e: PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [clamp(((e.clientX - r.left) / r.width) * 1000), clamp(((e.clientY - r.top) / r.height) * 1000)];
  };

  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!tool) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // A pointer that is already gone: the line still draws.
    }
    cur.current = { c: tool.color, w: tool.width, p: at(e) };
    paint();
  };

  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    const st = cur.current;
    if (!st || !tool) return;
    e.preventDefault();
    const [x, y] = at(e);
    const n = st.p.length;
    if (Math.abs(x - st.p[n - 2]) + Math.abs(y - st.p[n - 1]) < MIN_STEP) return;
    let line = st;
    if (n >= MAX_POINTS * 2) {
      tool.onStroke(copy(st));
      line = { c: st.c, w: st.w, p: [st.p[n - 2], st.p[n - 1], x, y] };
      cur.current = line;
    } else st.p.push(x, y);
    paint();
    tool.onLive(copy(line));
  };

  const up = () => {
    const st = cur.current;
    cur.current = null;
    // The page adds the line to the strokes, and that repaints.
    if (st && tool) tool.onStroke(copy(st));
  };

  return (
    <canvas
      ref={canvas}
      className={tool ? 'draw-pad is-drawing' : 'draw-pad'}
      role="img"
      aria-label="The drawing"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    />
  );
}
