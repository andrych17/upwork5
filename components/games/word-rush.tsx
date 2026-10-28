'use client';

// Word Rush in the board's look. The engine changes players in place, so the running round lives in a ref
// and every change publishes a fresh snapshot (view) that the render reads.
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react';
import {
  LEVELS,
  MIN_LENGTH,
  TRADE_COST,
  TileStream,
  VALUE,
  houseMove,
  newPlayer,
  playWord,
  tradeTiles,
  type Level,
  type Play,
  type Player,
} from '@/lib/word-rush/engine';

type Mode = 'computer' | 'solo' | 'buddy';

interface Round {
  code: string;
  minutes: number;
  endsAt: number;
  me: Player;
  house: { player: Player; level: Level; next: number } | null;
}

interface View {
  code: string;
  minutes: number;
  left: number;
  over: boolean;
  rack: string[];
  score: number;
  best: Play | null;
  log: Play[];
  house: { score: number; level: Level; log: Play[] } | null;
  sel: number[];
  trading: number[] | null;
  msg: { text: string; bad: boolean };
}

const MINUTES = [1, 3, 5];
const LEVEL_NAMES: [Level, string][] = [
  ['easy', 'Easy'],
  ['medium', 'Medium'],
  ['hard', 'Hard'],
];
const TICK_MS = 250;
const LOW_TIME_MS = 15_000;
const FEEDBACK_MS = 1500;
const PLACEHOLDER = [...'WORDRUSH'];

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 5 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}
function dailyCode(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `DAILY-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}
const cleanCode = (code: string) =>
  code
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 20);
function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
const now = () => Date.now();
function shuffle(tiles: string[]) {
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j]!, tiles[i]!];
  }
}
const houseDelay = (level: Level) =>
  (LEVELS[level].min + Math.random() * (LEVELS[level].max - LEVELS[level].min)) * 1000;

// Browser-only values, read through useSyncExternalStore so the prerendered page and hydration agree.
let suggestedCode = '';
const getSuggestedCode = () => (suggestedCode ||= randomCode());
const noSubscribe = () => () => {};
const getOrigin = () => location.origin;

function readRound(r: Round, now: number) {
  return {
    code: r.code,
    minutes: r.minutes,
    left: Math.max(0, r.endsAt - now),
    rack: [...r.me.rack],
    score: r.me.score,
    best: r.me.best,
    log: r.me.log.slice(0, 40),
    house: r.house && { score: r.house.player.score, level: r.house.level, log: r.house.player.log.slice(0, 40) },
  };
}

function result(v: View, mode: Mode, buddy: string): { title: string; text: string } {
  const best = v.best && `${v.best.word.toUpperCase()} for ${v.best.pts} points`;
  if (v.house) {
    const h = v.house.score;
    if (v.score > h) return { title: `You win, ${v.score} to ${h}`, text: best ? `Best word: ${best}.` : '' };
    if (v.score < h)
      return { title: `The computer wins, ${h} to ${v.score}`, text: 'Same tiles, same clock. Try this deal again.' };
    return { title: `A tie at ${v.score}`, text: 'Same tiles, same clock, same score.' };
  }
  const title = `Time. You scored ${v.score}`;
  if (mode === 'buddy')
    return {
      title,
      text: `Send ${buddy || 'your buddy'} your score and the deal. Same tiles, so the higher score wins.`,
    };
  return { title, text: best ? `Your best word was ${best}.` : 'No words this time. Try again.' };
}

export default function WordRush({ deal, buddy }: { deal: string; buddy: string }) {
  const suggested = useSyncExternalStore(noSubscribe, getSuggestedCode, () => '');
  const origin = useSyncExternalStore(noSubscribe, getOrigin, () => '');
  const [picked, setPicked] = useState<Mode | null>(null);
  const mode: Mode = picked ?? (deal || buddy ? 'buddy' : 'computer');
  const [level, setLevel] = useState<Level>('medium');
  const [minutes, setMinutes] = useState(1);
  const [typed, setTyped] = useState<string | null>(null);
  const code = typed ?? (deal || suggested);
  const [view, setView] = useState<View | null>(null);
  const [copyMsg, setCopyMsg] = useState('');
  const round = useRef<Round | null>(null);
  const feedbackTimer = useRef<number | undefined>(undefined);

  const live = view && !view.over ? view : null;
  const running = !!live;
  const dealLink = `${origin}/games#deal=${view?.code ?? cleanCode(code)}`;

  const publish = (patch: Partial<View> = {}) => {
    const r = round.current;
    if (!r) return;
    const at = now();
    setView((current) => current && { ...current, ...readRound(r, at), ...patch });
  };

  // A word that doesn't count shows a short reason and clears itself, so the player can keep going.
  const say = (text: string, bad = false) => {
    window.clearTimeout(feedbackTimer.current);
    if (bad)
      feedbackTimer.current = window.setTimeout(
        () => setView((current) => current && { ...current, msg: { text: '', bad: false } }),
        FEEDBACK_MS,
      );
    return { text, bad };
  };

  useEffect(() => () => window.clearTimeout(feedbackTimer.current), []);

  function start() {
    const dealCode = cleanCode(code) || randomCode();
    const at = now();
    const r: Round = {
      code: dealCode,
      minutes,
      endsAt: at + minutes * 60_000,
      me: newPlayer(new TileStream(dealCode)),
      house:
        mode === 'computer'
          ? { player: newPlayer(new TileStream(dealCode)), level, next: at + houseDelay(level) }
          : null,
    };
    round.current = r;
    setTyped(dealCode);
    setCopyMsg('');
    setView({ ...readRound(r, at), over: false, sel: [], trading: null, msg: say('Go. Make a word.') });
  }

  function end() {
    if (!round.current || !view || view.over) return;
    round.current.endsAt = Math.min(round.current.endsAt, now());
    publish({ over: true, sel: [], trading: null, msg: { text: '', bad: false } });
  }

  function tapTile(i: number) {
    if (!running || !view) return;
    if (view.trading) {
      const trading = view.trading.includes(i) ? view.trading.filter((j) => j !== i) : [...view.trading, i];
      return publish({ trading });
    }
    if (!view.sel.includes(i)) publish({ sel: [...view.sel, i] });
  }

  // Typing works as well as tapping: each typed letter takes the first unused matching tile.
  function typeWord(value: string) {
    if (!running || !view || view.trading) return;
    const sel: number[] = [];
    for (const letter of value.toUpperCase()) {
      const i = view.rack.findIndex((tile, j) => tile === letter && !sel.includes(j));
      if (i !== -1) sel.push(i);
    }
    publish({ sel });
  }

  function submit() {
    const r = round.current;
    if (!r || !running || !view || view.trading || !view.sel.length) return;
    const res = playWord(r.me, view.sel);
    if (res.ok) return publish({ sel: [], msg: say(`${res.word.toUpperCase()} +${res.pts}`) });
    const reason =
      res.reason === 'short'
        ? `Use at least ${MIN_LENGTH} letters`
        : res.reason === 'repeat'
          ? 'Already played'
          : 'Not a word';
    publish({ sel: [], msg: say(reason, true) });
  }

  function scramble() {
    const r = round.current;
    if (!r || !running) return;
    shuffle(r.me.rack);
    publish({ sel: [], trading: view?.trading ? [] : null });
  }

  function tradeNow() {
    const r = round.current;
    if (!r || !running || !view?.trading) return;
    if (!view.trading.length) return publish({ msg: say('Pick at least one tile to trade', true) });
    const n = view.trading.length;
    tradeTiles(r.me, view.trading);
    publish({ trading: null, msg: say(`Traded ${n} tile${n === 1 ? '' : 's'} (−${TRADE_COST})`) });
  }

  // The clock and the computer share one tick while a round is on.
  const onTick = useEffectEvent(() => {
    const r = round.current;
    if (!r) return;
    const at = now();
    if (r.house && at >= r.house.next && at < r.endsAt) {
      houseMove(r.house.player, r.house.level, Math.random);
      r.house.next = at + houseDelay(r.house.level);
    }
    if (at >= r.endsAt) end();
    else publish();
  });

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => onTick(), TICK_MS);
    return () => window.clearInterval(id);
  }, [running]);

  function copy(text: string) {
    const fail = () => setCopyMsg('Select the text and copy it.');
    if (!navigator.clipboard) return fail();
    navigator.clipboard.writeText(text).then(() => setCopyMsg('Copied.'), fail);
  }

  const rack = view?.rack ?? PLACEHOLDER;
  const selected = view?.sel ?? [];
  const word = selected.map((i) => rack[i]).join('');
  const headline =
    mode === 'computer'
      ? 'Race the computer on the same tiles.'
      : mode === 'solo'
        ? 'Race your own best score.'
        : `Same tiles for you and ${buddy || 'your buddy'}.`;
  const outcome = view?.over ? result(view, mode, buddy) : null;
  const share =
    view &&
    `MeetDoConnect Word Rush · Deal ${view.code} · ${view.minutes} min\nMy score: ${view.score}${
      view.best ? ` (best word ${view.best.word.toUpperCase()} +${view.best.pts})` : ''
    }\nPlay the same tiles: ${dealLink}`;

  return (
    <section className="word-game" id="word-rush">
      <div className="word-instructions">
        <p className="section-label">Word Rush</p>
        <h2>{headline}</h2>
        <div className="word-mode-switch" role="group" aria-label="Who you play">
          {(
            [
              ['computer', 'Vs computer'],
              ['solo', 'Solo'],
              ['buddy', 'With a buddy'],
            ] as const
          ).map(([value, label]) => (
            <button
              className={mode === value ? 'selected' : ''}
              type="button"
              aria-pressed={mode === value}
              disabled={running}
              key={value}
              onClick={() => {
                setPicked(value);
                setView(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === 'computer' && (
          <div className="word-mode-switch word-level" role="group" aria-label="Computer level">
            {LEVEL_NAMES.map(([value, label]) => (
              <button
                className={level === value ? 'selected' : ''}
                type="button"
                aria-pressed={level === value}
                disabled={running}
                key={value}
                onClick={() => {
                  setLevel(value);
                  setView(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div
          className="letter-rack"
          aria-label={running ? `Your tiles: ${rack.join(' ')}` : 'Tiles appear when you start'}
        >
          {rack.map((letter, i) => {
            const trade = view?.trading?.includes(i);
            const used = !view?.trading && selected.includes(i);
            return (
              <button
                className={trade ? 'tile-trade' : used ? 'tile-used' : ''}
                type="button"
                disabled={!running || used}
                aria-pressed={view?.trading ? trade : undefined}
                aria-label={`${letter}, ${VALUE[letter]} points`}
                key={`${letter}-${i}`}
                onClick={() => tapTile(i)}
              >
                {letter}
                <sup aria-hidden="true">{VALUE[letter]}</sup>
              </button>
            );
          })}
        </div>
        <div className="tile-actions">
          <button type="button" disabled={!running || !selected.length} onClick={() => publish({ sel: [] })}>
            Clear
          </button>
          <button type="button" disabled={!running} onClick={scramble}>
            Scramble Tiles
          </button>
          <button
            type="button"
            disabled={!running}
            aria-pressed={!!view?.trading}
            onClick={() => publish({ sel: [], trading: view?.trading ? null : [] })}
          >
            {view?.trading ? 'Cancel trade' : `Trade tiles (−${TRADE_COST})`}
          </button>
        </div>
        {live?.trading && (
          <div className="trade-panel">
            <span>Tap the tiles you want to swap. Each trade costs {TRADE_COST} points.</span>
            <button type="button" onClick={tradeNow}>
              Trade now
            </button>
          </div>
        )}
        <p>
          Make a word of at least three letters. Rare letters score more, and words of four letters or more earn a
          bonus. Stuck? Trade tiles for {TRADE_COST} points. Everyone with the same deal code gets the same tiles in the
          same order{mode === 'computer' ? ', including the computer, which plays at its own pace' : ''}.
        </p>
      </div>

      <div className="word-play">
        <div className="timer-score word-scores">
          <div>
            <span>Time</span>
            <strong className={live && live.left <= LOW_TIME_MS ? 'time-low' : ''} role="timer">
              {clock(view?.left ?? minutes * 60_000)}
            </strong>
          </div>
          <div>
            <span>You</span>
            <strong>{view?.score ?? 0}</strong>
            <small>{view?.best ? `Best: ${view.best.word.toUpperCase()} +${view.best.pts}` : ''}</small>
          </div>
          {mode === 'computer' && (
            <div>
              <span>Computer · {view?.house?.level ?? level}</span>
              <strong>{view?.house?.score ?? 0}</strong>
              <small>
                {view?.house?.log[0] ? `${view.house.log[0].word.toUpperCase()} +${view.house.log[0].pts}` : ''}
              </small>
            </div>
          )}
        </div>

        {live ? (
          <>
            <label className={`word-entry ${live.msg.bad ? 'word-rejected' : ''}`}>
              <span className="sr-only">Type a word or choose tiles</span>
              <input
                value={word.toLowerCase()}
                onChange={(event) => typeWord(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submit();
                }}
                readOnly={!!live.trading}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="Tap tiles or type a word…"
              />
              <button type="button" onClick={submit} disabled={!selected.length}>
                Play word
              </button>
            </label>
            <p className={`word-feedback ${live.msg.bad ? '' : 'word-feedback-ok'}`} role="status">
              {live.msg.text}
            </p>
            <button className="end-round" type="button" onClick={end}>
              End round
            </button>
          </>
        ) : outcome ? null : (
          <div className="word-setup">
            <div className="word-deal">
              <label htmlFor="word-deal">Deal code</label>
              <input
                id="word-deal"
                value={code}
                maxLength={20}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setTyped(cleanCode(event.target.value))}
              />
              <button type="button" onClick={() => setTyped(randomCode())}>
                New deal
              </button>
              <button type="button" onClick={() => setTyped(dailyCode())}>
                Today’s deal
              </button>
            </div>
            <div className="word-mode-switch word-timer" role="group" aria-label="Timer">
              {MINUTES.map((value) => (
                <button
                  className={minutes === value ? 'selected' : ''}
                  type="button"
                  aria-pressed={minutes === value}
                  key={value}
                  onClick={() => setMinutes(value)}
                >
                  {value} min
                </button>
              ))}
            </div>
            {mode === 'buddy' && (
              <div className="word-share">
                <strong>Send {buddy || 'your buddy'} this deal</strong>
                <span>They get the same tiles in the same order. Play when you like, then compare scores.</span>
                <input readOnly value={dealLink} aria-label="Deal link" onFocus={(event) => event.target.select()} />
                <button type="button" onClick={() => copy(dealLink)}>
                  Copy link
                </button>
                <small role="status">{copyMsg}</small>
              </div>
            )}
          </div>
        )}

        {outcome && view && share && (
          <div className="round-finished" role="status">
            <strong>{outcome.title}</strong>
            {outcome.text && <span>{outcome.text}</span>}
            {mode !== 'computer' && (
              <>
                <textarea readOnly value={share} aria-label="Your result" onFocus={(event) => event.target.select()} />
                <button className="round-copy" type="button" onClick={() => copy(share)}>
                  Copy result
                </button>
                <small>{copyMsg}</small>
              </>
            )}
          </div>
        )}

        {!running && (
          <button className="start-game" type="button" onClick={start}>
            {outcome
              ? 'Play this deal again'
              : minutes === 1
                ? 'Start 60-second round'
                : `Start ${minutes}-minute round`}
          </button>
        )}
        {outcome && (
          <button
            className="new-deal"
            type="button"
            onClick={() => {
              setTyped(randomCode());
              setView(null);
            }}
          >
            New deal
          </button>
        )}

        {view && (view.log.length > 0 || !!view.house?.log.length) && (
          <div className="found-words" aria-label="Words played">
            {view.log.map((play) => (
              <span key={`me-${play.word}`}>
                {play.word} +{play.pts}
              </span>
            ))}
            {view.house?.log.map((play) => (
              <span className="player-two-word" key={`cpu-${play.word}`}>
                CPU · {play.word} +{play.pts}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
