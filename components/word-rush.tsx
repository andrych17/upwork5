'use client';

// Word Rush screen. The engine changes players in place, so the running game lives in a ref and every
// move publishes a fresh snapshot (View) that the render reads.
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react';
import {
  LEVELS,
  TRADE_COST,
  TileStream,
  VALUE,
  houseMove,
  newPlayer,
  playWord,
  tradeTiles,
  type Level,
  type Player,
} from '@/lib/word-rush/engine';
import { Button, Shell, cn } from './ui';

type Setting = Level | 'off';
type Phase = 'setup' | 'play' | 'end';

interface Game {
  code: string;
  minutes: number;
  active: boolean;
  endsAt: number;
  left: number;
  me: Player;
  house: { player: Player; level: Level; next: number } | null;
}

interface Ui {
  sel: number[];
  tradeMode: boolean;
  tradeSel: ReadonlySet<number>;
  msg: { text: string; kind: '' | 'ok' | 'bad' };
  houseLast: string;
}

const LOW_TIME_MS = 15_000;
const TICK_MS = 250;
const FIELD = 'min-h-11 max-w-full min-w-0 rounded-2xl border border-line-strong bg-bg px-3.5 py-2';
const LABEL = 'text-[0.82rem] font-bold text-muted';

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 5 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}
function dailyCode(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `DAILY-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}
function fmt(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
const houseDelay = (level: Level) =>
  (LEVELS[level].min + Math.random() * (LEVELS[level].max - LEVELS[level].min)) * 1000;

// Browser-only values, read through useSyncExternalStore so the server render and hydration agree.
let suggestedCode = '';
const getSuggestedCode = () => (suggestedCode ||= randomCode());
const noSubscribe = () => () => {};
const bestKey = (minutes: string) => `meetdoconnect.wordrush.best.${minutes}`;
function readBest(minutes: string): number {
  try {
    return parseInt(localStorage.getItem(bestKey(minutes)) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}
function saveBest(minutes: number, score: number) {
  try {
    if (score > readBest(String(minutes))) localStorage.setItem(bestKey(String(minutes)), String(score));
  } catch {
    /* storage blocked: the best score just isn't kept */
  }
}
function subscribeStorage(onChange: () => void) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

function readGame(g: Game) {
  return {
    code: g.code,
    minutes: g.minutes,
    left: g.left,
    rack: [...g.me.rack],
    score: g.me.score,
    best: g.me.best,
    log: g.me.log.slice(0, 40),
    wordsPlayed: g.me.log.length,
    house: g.house && { score: g.house.player.score, level: g.house.level },
  };
}
type View = Ui & ReturnType<typeof readGame>;

function result(v: View): { title: string; text: string; share: string } {
  const me = v.score;
  const h = v.house?.score ?? null;
  const best = v.best;
  const bestWord = best?.word.toUpperCase();
  let title: string;
  let text: string;
  if (h === null) {
    title = `Time! You scored ${me}.`;
    text = best ? `Your best word was ${bestWord} for ${best.pts} points.` : 'No words this time. Try again!';
  } else if (me > h) {
    title = `You win, ${me} to ${h}!`;
    text = best ? `Best word: ${bestWord} (+${best.pts}).` : '';
  } else if (me < h) {
    title = `The House wins, ${h} to ${me}.`;
    text = 'Same tiles, same clock. Try this deal again.';
  } else {
    title = `A tie at ${me}!`;
    text = 'Same tiles, same clock, same score.';
  }
  let share = `MeetDoConnect Word Rush · Deal ${v.code} · ${v.minutes} min\nMy score: ${me}${best ? ` (best word ${bestWord} +${best.pts})` : ''}\n${v.wordsPlayed} words played`;
  if (v.house) share += `\nHouse (${v.house.level}): ${v.house.score}`;
  share += `\nUse deal code ${v.code} to play the same tiles.`;
  return { title, text, share };
}

function Tile({
  letter,
  small,
  state,
  onClick,
}: {
  letter: string;
  small?: boolean;
  state?: 'used' | 'pick';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${letter}, ${VALUE[letter]} points`}
      onClick={onClick}
      className={cn(
        'relative grid place-items-center rounded-xl border-2 border-sun bg-sun-soft p-0 font-display leading-none font-bold text-fg shadow-[0_3px_0_color-mix(in_srgb,var(--sun)_55%,transparent)] transition duration-200 ease-spring',
        small ? 'size-11.5 text-2xl' : 'size-[clamp(40px,11.5vw,62px)] text-[clamp(21px,6vw,32px)]',
        state === 'used' ? 'opacity-25' : 'hover:-translate-y-0.5 active:translate-y-px active:scale-97',
        state === 'pick' && 'border-accent bg-accent-soft',
      )}
    >
      {letter}
      <sup className="absolute top-auto right-1.5 bottom-1 font-sans text-[0.32em] font-semibold">{VALUE[letter]}</sup>
    </button>
  );
}

function ScoreBox({ label, score, note }: { label: string; score: number; note: string }) {
  return (
    <div role="group" aria-label={label} className="grid min-w-0 gap-0.5 rounded-2xl bg-bg px-4 py-3 ring-1 ring-line">
      <span className="text-[0.72rem] font-bold tracking-[0.12em] text-muted uppercase">{label}</span>
      <b className="font-display text-[2rem] leading-tight tabular-nums">{score}</b>
      <small className="min-h-[1.2em] text-[0.82rem] wrap-anywhere text-muted">{note}</small>
    </div>
  );
}

export default function WordRush() {
  const [phase, setPhase] = useState<Phase>('setup');
  const suggested = useSyncExternalStore(noSubscribe, getSuggestedCode, () => '');
  const [typed, setTyped] = useState<string | null>(null);
  const code = typed ?? suggested;
  const [minutes, setMinutes] = useState('3');
  const [level, setLevel] = useState<Setting>('medium');
  const best = useSyncExternalStore(
    subscribeStorage,
    () => readBest(minutes),
    () => 0,
  );
  const [copyMsg, setCopyMsg] = useState('');
  const [view, setView] = useState<View | null>(null);
  const game = useRef<Game | null>(null);
  const shareRef = useRef<HTMLTextAreaElement>(null);

  const liveGame = () => (game.current?.active ? game.current : null);
  const publish = (patch: Partial<Ui> = {}) => {
    if (!view || !game.current) return;
    setView({ ...view, ...patch, ...readGame(game.current) });
  };

  function start() {
    const dealCode = code.trim().toUpperCase() || randomCode();
    const mins = Number(minutes) || 3;
    const now = Date.now();
    const g: Game = {
      code: dealCode,
      minutes: mins,
      active: true,
      endsAt: now + mins * 60_000,
      left: mins * 60_000,
      me: newPlayer(new TileStream(dealCode)),
      house:
        level === 'off' ? null : { player: newPlayer(new TileStream(dealCode)), level, next: now + houseDelay(level) },
    };
    game.current = g;
    setTyped(dealCode);
    setCopyMsg('');
    setView({
      sel: [],
      tradeMode: false,
      tradeSel: new Set(),
      msg: { text: 'Go! Make a word.', kind: '' },
      houseLast: '',
      ...readGame(g),
    });
    setPhase('play');
  }

  function end() {
    const g = liveGame();
    if (!g) return;
    g.active = false;
    saveBest(g.minutes, g.me.score);
    publish();
    setPhase('end');
  }

  function tapTile(i: number) {
    if (!liveGame() || !view) return;
    if (view.tradeMode) {
      const next = new Set(view.tradeSel);
      if (!next.delete(i)) next.add(i);
      publish({ tradeSel: next });
    } else if (!view.sel.includes(i)) publish({ sel: [...view.sel, i] });
  }
  const removeAt = (k: number) => liveGame() && view && publish({ sel: view.sel.filter((_, j) => j !== k) });
  const clearWord = () => publish({ sel: [] });

  function typeLetter(ch: string) {
    if (!view || view.tradeMode) return;
    const i = view.rack.findIndex((l, j) => l === ch.toUpperCase() && !view.sel.includes(j));
    if (i >= 0) tapTile(i);
  }

  function submit() {
    const g = liveGame();
    if (!g || !view || view.tradeMode) return;
    const r = playWord(g.me, view.sel);
    if (r.ok) return publish({ sel: [], msg: { text: `${r.word.toUpperCase()}  +${r.pts}`, kind: 'ok' } });
    const word = r.word.toUpperCase();
    const text =
      r.reason === 'short'
        ? 'Use at least 2 tiles.'
        : r.reason === 'repeat'
          ? `You already played ${word}.`
          : `${word} is not in the word list.`;
    publish({ msg: { text, kind: 'bad' } });
  }

  function shuffle() {
    const g = liveGame();
    if (!g) return;
    const a = g.me.rack;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    publish({ sel: [], tradeSel: new Set() });
  }

  const openTrade = () => liveGame() && publish({ sel: [], tradeMode: true, tradeSel: new Set() });
  const closeTrade = () => publish({ tradeMode: false, tradeSel: new Set() });
  const selectAllTrade = () => view && publish({ tradeSel: new Set(view.rack.map((_, i) => i)) });

  function tradeNow() {
    const g = liveGame();
    if (!g || !view?.tradeMode) return;
    const idxs = view.rack.map((_, i) => i).filter((i) => view.tradeSel.has(i));
    if (!idxs.length) return publish({ msg: { text: 'Pick at least one tile to trade.', kind: 'bad' } });
    tradeTiles(g.me, idxs);
    publish({
      tradeMode: false,
      tradeSel: new Set(),
      msg: { text: `Traded ${idxs.length} tile${idxs.length === 1 ? '' : 's'} (−${TRADE_COST}).`, kind: '' },
    });
  }

  // Clock and the House share one tick while a game is on.
  const onTick = useEffectEvent(() => {
    const g = liveGame();
    if (!g || !view) return;
    const now = Date.now();
    g.left = g.endsAt - now;
    let houseLast = view.houseLast;
    if (g.house && now >= g.house.next && g.left > 0) {
      const r = houseMove(g.house.player, g.house.level, Math.random);
      houseLast = r.traded ? `traded tiles (−${TRADE_COST})` : `${r.word.toUpperCase()} +${r.pts}`;
      g.house.next = now + houseDelay(g.house.level);
    }
    if (g.left <= 0) end();
    else publish({ houseLast });
  });

  // Type letters, Enter to play, Backspace to take back, Escape to clear.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (!liveGame() || !view) return;
    const tag = e.target instanceof HTMLElement ? e.target.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      if (view.sel.length) removeAt(view.sel.length - 1);
    } else if (e.key === 'Escape') {
      if (view.tradeMode) closeTrade();
      else clearWord();
    } else if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) typeLetter(e.key);
  });

  useEffect(() => {
    if (phase !== 'play') return;
    const id = setInterval(() => onTick(), TICK_MS);
    const handleKey = (e: KeyboardEvent) => onKey(e);
    document.addEventListener('keydown', handleKey);
    return () => {
      clearInterval(id);
      document.removeEventListener('keydown', handleKey);
    };
  }, [phase]);

  function copyShare(text: string) {
    const fail = () => {
      shareRef.current?.focus();
      shareRef.current?.select();
      setCopyMsg('Select the text and copy it.');
    };
    if (!navigator.clipboard) return fail();
    navigator.clipboard.writeText(text).then(() => setCopyMsg('Copied.'), fail);
  }

  if (phase === 'setup' || !view) {
    return (
      <Shell key="setup" as="section" aria-label="Game setup">
        <div className="flex flex-wrap items-end gap-2.5">
          <div className="grid min-w-0 gap-1.5">
            <label htmlFor="code" className={LABEL}>
              Deal code
            </label>
            <input
              id="code"
              type="text"
              maxLength={20}
              autoComplete="off"
              spellCheck={false}
              aria-describedby="codeHint"
              value={code}
              onChange={(e) => setTyped(e.target.value)}
              className={cn(FIELD, 'w-[12ch] font-bold tracking-[0.08em] uppercase')}
            />
          </div>
          <Button onClick={() => setTyped(randomCode())}>New deal</Button>
          <Button onClick={() => setTyped(dailyCode())}>Today&apos;s deal</Button>
        </div>
        <p id="codeHint" className="text-[0.86rem] text-muted">
          Everyone who uses the same code gets the same tiles in the same order. Share your code and compare scores.
        </p>
        <div className="flex flex-wrap items-end gap-2.5">
          <div className="grid min-w-0 gap-1.5">
            <label htmlFor="minutes" className={LABEL}>
              Timer
            </label>
            <select id="minutes" value={minutes} onChange={(e) => setMinutes(e.target.value)} className={FIELD}>
              <option value="2">2 minutes</option>
              <option value="3">3 minutes</option>
              <option value="5">5 minutes</option>
            </select>
          </div>
          <div className="grid min-w-0 gap-1.5">
            <label htmlFor="level" className={LABEL}>
              Race the House
            </label>
            <select id="level" value={level} onChange={(e) => setLevel(e.target.value as Setting)} className={FIELD}>
              <option value="off">Off (solo)</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="primary" size="lg" arrow="→" onClick={start}>
            Start
          </Button>
        </div>
        {best > 0 && <p className="text-[0.86rem] text-muted">Your best on this timer: {best} points.</p>}
      </Shell>
    );
  }

  if (phase === 'end') {
    const r = result(view);
    return (
      <Shell key="end" ink as="section" aria-label="Result">
        <h2 className="text-[clamp(1.8rem,5vw,2.6rem)]">{r.title}</h2>
        {r.text && <p>{r.text}</p>}
        <label htmlFor="share" className="text-[0.86rem] text-muted">
          Copy this to share your score
        </label>
        <textarea
          id="share"
          ref={shareRef}
          readOnly
          value={r.share}
          className="min-h-28 w-full resize-y rounded-2xl border border-line bg-ink-2 px-3.5 py-3 text-[0.92rem]"
        />
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="primary" onClick={() => copyShare(r.share)}>
            Copy result
          </Button>
          <Button onClick={start}>Play this deal again</Button>
          <Button onClick={() => setPhase('setup')}>New game</Button>
        </div>
        <p role="status" className="text-[0.88rem] text-accent">
          {copyMsg}
        </p>
      </Shell>
    );
  }

  const remaining = Math.max(0, view.left / (view.minutes * 60_000));
  return (
    <Shell key="play" as="section" aria-label="Game" coreClassName="gap-4.5">
      <div className="grid gap-3.5">
        <div className="grid gap-2">
          <div
            role="timer"
            className={cn(
              'font-display text-[clamp(2.6rem,6vw,3.4rem)] leading-none font-bold tracking-[-0.03em] tabular-nums',
              view.left <= LOW_TIME_MS && 'text-bad',
            )}
          >
            {fmt(view.left)}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-band">
            <i
              className="block h-full origin-left bg-accent transition-transform duration-250 ease-linear"
              style={{ transform: `scaleX(${remaining})` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
          <ScoreBox
            label="You"
            score={view.score}
            note={view.best ? `Best: ${view.best.word.toUpperCase()} +${view.best.pts}` : ''}
          />
          {view.house && (
            <ScoreBox label={`House (${view.house.level})`} score={view.house.score} note={view.houseLast} />
          )}
        </div>
      </div>
      <div
        aria-label="Your word"
        className="flex min-h-16 flex-wrap items-center gap-1.5 rounded-2xl border-2 border-dashed border-line-strong p-2"
      >
        {view.sel.length ? (
          view.sel.map((i, k) => <Tile key={k} small letter={view.rack[i]} onClick={() => removeAt(k)} />)
        ) : (
          <span className="pl-1.5 text-[0.92rem] text-muted">Tap tiles or type letters to spell a word</span>
        )}
      </div>
      <div aria-label="Your tiles" className="flex flex-wrap justify-center gap-1.5">
        {view.rack.map((letter, i) => (
          <Tile
            key={i}
            letter={letter}
            state={
              view.tradeMode ? (view.tradeSel.has(i) ? 'pick' : undefined) : view.sel.includes(i) ? 'used' : undefined
            }
            onClick={() => tapTile(i)}
          />
        ))}
      </div>
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'min-h-[1.6em] font-semibold',
          view.msg.kind === 'ok' && 'text-accent',
          view.msg.kind === 'bad' && 'text-bad',
        )}
      >
        {view.msg.text}
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="primary" onClick={submit}>
          Play word
        </Button>
        <Button onClick={clearWord}>Clear</Button>
        <Button onClick={shuffle}>Shuffle</Button>
        <Button onClick={openTrade}>Trade tiles (−{TRADE_COST})</Button>
        <Button variant="quiet" onClick={end}>
          End game
        </Button>
      </div>
      {view.tradeMode && (
        <div className="grid gap-2.5 rounded-2xl bg-accent-soft px-3.5 py-3">
          <span>Tap the tiles you want to trade, then press Trade now. Each trade costs {TRADE_COST} points.</span>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="primary" onClick={tradeNow}>
              Trade now
            </Button>
            <Button onClick={selectAllTrade}>Select all</Button>
            <Button variant="quiet" onClick={closeTrade}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      <div>
        <h3 id="words" className="text-lg">
          Your words
        </h3>
        <ol
          aria-labelledby="words"
          className="mt-1.5 grid max-h-55 list-decimal gap-0.5 overflow-y-auto pl-5.5 tabular-nums"
        >
          {view.log.map((l) => (
            <li key={l.word}>
              {l.word.toUpperCase()} <span className="font-bold text-accent">+{l.pts}</span>
            </li>
          ))}
        </ol>
      </div>
    </Shell>
  );
}
