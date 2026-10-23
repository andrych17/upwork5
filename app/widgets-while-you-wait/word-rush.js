'use client';

// Word Rush UI. The engine mutates the game object in place, so the game lives in a ref
// and render() repaints after each move.
import { useEffect, useReducer, useRef, useState } from 'react';
import { LEVELS, TRADE_COST, TileStream, VALUE, houseMove, newPlayer, playWord, tradeTiles } from './engine';

const LOW_TIME_MS = 15000;
const TICK_MS = 250;

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}
function dailyCode() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `DAILY-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}
function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
const bestKey = (minutes) => `meetdoconnect.wordrush.best.${minutes}`;
function readBest(minutes) {
  try { return parseInt(localStorage.getItem(bestKey(minutes)) || '0', 10) || 0; } catch { return 0; }
}
function saveBest(minutes, score) {
  try { if (score > readBest(minutes)) localStorage.setItem(bestKey(minutes), String(score)); } catch { /* storage blocked */ }
}
function houseDelay(level) {
  const cfg = LEVELS[level];
  return (cfg.min + Math.random() * (cfg.max - cfg.min)) * 1000;
}

function result(g) {
  const me = g.me.score;
  const h = g.house ? g.house.score : null;
  const best = g.me.best && `${g.me.best.word.toUpperCase()}`;
  let title;
  let text;
  if (h === null) {
    title = `Time! You scored ${me}.`;
    text = best ? `Your best word was ${best} for ${g.me.best.pts} points.` : 'No words this time. Try again!';
  } else if (me > h) {
    title = `You win, ${me} to ${h}!`;
    text = best ? `Best word: ${best} (+${g.me.best.pts}).` : '';
  } else if (me < h) {
    title = `The House wins, ${h} to ${me}.`;
    text = 'Same tiles, same clock. Try this deal again.';
  } else {
    title = `A tie at ${me}!`;
    text = 'Same tiles, same clock, same score.';
  }
  let share = `MeetDoConnect Word Rush · Deal ${g.code} · ${g.minutes} min\nMy score: ${me}${best ? ` (best word ${best} +${g.me.best.pts})` : ''}\n${g.me.log.length} words played`;
  if (h !== null) share += `\nHouse (${g.level}): ${h}`;
  share += `\nUse deal code ${g.code} to play the same tiles.`;
  return { title, text, share };
}

function Tile({ letter, className, onClick }) {
  return (
    <button type="button" className={className ? `tile ${className}` : 'tile'} aria-label={`${letter}, ${VALUE[letter]} points`} onClick={onClick}>
      {letter}<sup>{VALUE[letter]}</sup>
    </button>
  );
}

export default function WordRush() {
  const [phase, setPhase] = useState('setup'); // setup | play | end
  const [code, setCode] = useState('');
  const [minutes, setMinutes] = useState('3');
  const [level, setLevel] = useState('medium');
  const [best, setBest] = useState(0);
  const [copyMsg, setCopyMsg] = useState('');
  const [, render] = useReducer((n) => n + 1, 0);
  const game = useRef(null);
  const shareRef = useRef(null);
  const g = game.current;

  // Random code and saved best only exist in the browser, so set them after the first paint.
  useEffect(() => setCode(randomCode()), []);
  useEffect(() => {
    if (phase === 'setup') setBest(readBest(parseInt(minutes, 10)));
  }, [phase, minutes]);

  const live = () => game.current && game.current.active;
  const say = (text, kind = '') => { game.current.msg = { text, kind }; };

  function start() {
    const dealCode = code.trim().toUpperCase() || randomCode();
    const mins = parseInt(minutes, 10) || 3;
    const now = Date.now();
    setCode(dealCode);
    game.current = {
      code: dealCode, minutes: mins, level, active: true, endsAt: now + mins * 60000, left: mins * 60000,
      me: newPlayer(new TileStream(dealCode)), house: null, houseNext: 0, houseLast: '',
      sel: [], tradeMode: false, tradeSel: {}, msg: { text: 'Go! Make a word.', kind: '' },
    };
    if (level !== 'off') {
      game.current.house = newPlayer(new TileStream(dealCode));
      game.current.houseNext = now + houseDelay(level);
    }
    setCopyMsg('');
    setPhase('play');
    render();
  }

  function end() {
    if (!live()) return;
    game.current.active = false;
    saveBest(game.current.minutes, game.current.me.score);
    setPhase('end');
  }

  function tapTile(i) {
    const cur = game.current;
    if (!live()) return;
    if (cur.tradeMode) cur.tradeSel = { ...cur.tradeSel, [i]: !cur.tradeSel[i] };
    else if (!cur.sel.includes(i)) cur.sel = [...cur.sel, i];
    render();
  }
  function removeAt(k) {
    if (!live()) return;
    game.current.sel = game.current.sel.filter((_, j) => j !== k);
    render();
  }
  function clearWord() {
    if (!game.current) return;
    game.current.sel = [];
    render();
  }
  function typeLetter(ch) {
    const cur = game.current;
    if (!live() || cur.tradeMode) return;
    const i = cur.me.rack.findIndex((l, j) => l === ch.toUpperCase() && !cur.sel.includes(j));
    if (i >= 0) tapTile(i);
  }
  function submit() {
    const cur = game.current;
    if (!live() || cur.tradeMode) return;
    const r = playWord(cur.me, cur.sel);
    if (r.ok) {
      cur.sel = [];
      say(`${r.word.toUpperCase()}  +${r.pts}`, 'ok');
    } else if (r.reason === 'short') say('Use at least 2 tiles.', 'bad');
    else if (r.reason === 'repeat') say(`You already played ${r.word.toUpperCase()}.`, 'bad');
    else say(`${r.word.toUpperCase()} is not in the word list.`, 'bad');
    render();
  }
  function shuffle() {
    const cur = game.current;
    if (!live()) return;
    const a = cur.me.rack;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    cur.sel = [];
    cur.tradeSel = {};
    render();
  }
  function openTrade() {
    if (!live()) return;
    Object.assign(game.current, { sel: [], tradeMode: true, tradeSel: {} });
    render();
  }
  function closeTrade() {
    if (!game.current) return;
    Object.assign(game.current, { tradeMode: false, tradeSel: {} });
    render();
  }
  function selectAllTrade() {
    const cur = game.current;
    if (!cur || !cur.tradeMode) return;
    cur.tradeSel = Object.fromEntries(cur.me.rack.map((_, i) => [i, true]));
    render();
  }
  function tradeNow() {
    const cur = game.current;
    if (!live() || !cur.tradeMode) return;
    const idxs = cur.me.rack.map((_, i) => i).filter((i) => cur.tradeSel[i]);
    if (!idxs.length) {
      say('Pick at least one tile to trade.', 'bad');
      render();
      return;
    }
    tradeTiles(cur.me, idxs);
    Object.assign(cur, { tradeMode: false, tradeSel: {} });
    say(`Traded ${idxs.length} tile${idxs.length === 1 ? '' : 's'} (−${TRADE_COST}).`);
    render();
  }

  // Clock and the House: both run on the same tick while a game is on.
  useEffect(() => {
    if (phase !== 'play') return undefined;
    const id = setInterval(() => {
      const cur = game.current;
      if (!cur.active) return;
      const now = Date.now();
      cur.left = cur.endsAt - now;
      if (cur.house && now >= cur.houseNext && cur.left > 0) {
        const r = houseMove(cur.house, cur.level, Math.random);
        cur.houseLast = r.traded ? `traded tiles (−${TRADE_COST})` : `${r.word.toUpperCase()} +${r.pts}`;
        cur.houseNext = now + houseDelay(cur.level);
      }
      if (cur.left <= 0) end();
      else render();
    }, TICK_MS);
    return () => clearInterval(id);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Type letters, Enter to play, Backspace to take back, Escape to clear.
  useEffect(() => {
    if (phase !== 'play') return undefined;
    const onKey = (e) => {
      const cur = game.current;
      if (!cur || !cur.active) return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      else if (e.key === 'Backspace') { e.preventDefault(); if (cur.sel.length) removeAt(cur.sel.length - 1); }
      else if (e.key === 'Escape') { if (cur.tradeMode) closeTrade(); else clearWord(); }
      else if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) typeLetter(e.key);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function copyShare(text) {
    const fail = () => {
      try { shareRef.current.focus(); shareRef.current.select(); } catch { /* nothing to select */ }
      setCopyMsg('Select the text and copy it.');
    };
    try { navigator.clipboard.writeText(text).then(() => setCopyMsg('Copied.'), fail); } catch { fail(); }
  }

  if (phase === 'setup' || !g) {
    return (
      <section key="setup" className="shell" aria-label="Game setup">
        <div className="core">
          <div className="row">
            <div className="field">
              <label htmlFor="code">Deal code</label>
              <input id="code" type="text" maxLength={20} autoComplete="off" spellCheck={false} aria-describedby="codeHint" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <button className="btn" type="button" onClick={() => setCode(randomCode())}>New deal</button>
            <button className="btn" type="button" onClick={() => setCode(dailyCode())}>Today&apos;s deal</button>
          </div>
          <p className="hint" id="codeHint">Everyone who uses the same code gets the same tiles in the same order. Share your code and compare scores.</p>
          <div className="row">
            <div className="field">
              <label htmlFor="minutes">Timer</label>
              <select id="minutes" value={minutes} onChange={(e) => setMinutes(e.target.value)}>
                <option value="2">2 minutes</option>
                <option value="3">3 minutes</option>
                <option value="5">5 minutes</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="level">Race the House</label>
              <select id="level" value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="off">Off (solo)</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>
          <div className="actions"><button className="btn primary big" type="button" onClick={start}>Start<span className="arrow" aria-hidden="true">→</span></button></div>
          {best > 0 && <p className="hint">Your best on this timer: {best} points.</p>}
        </div>
      </section>
    );
  }

  if (phase === 'end') {
    const r = result(g);
    return (
      <section key="end" className="shell" aria-label="Result">
        <div className="core ink">
          <h2 className="result-title">{r.title}</h2>
          {r.text && <p>{r.text}</p>}
          <label htmlFor="share" className="hint">Copy this to share your score</label>
          <textarea id="share" ref={shareRef} readOnly value={r.share} />
          <div className="actions">
            <button className="btn primary" type="button" onClick={() => copyShare(r.share)}>Copy result</button>
            <button className="btn" type="button" onClick={start}>Play this deal again</button>
            <button className="btn" type="button" onClick={() => setPhase('setup')}>New game</button>
          </div>
          <p className="msg" role="status">{copyMsg}</p>
        </div>
      </section>
    );
  }

  const pct = Math.max(0, g.left / (g.minutes * 60000));
  return (
    <section key="play" className="shell" aria-label="Game">
      <div className="core play">
        <div className="hud">
          <div className="clock">
            <div className={g.left <= LOW_TIME_MS ? 'clock-num low' : 'clock-num'}>{fmt(g.left)}</div>
            <div className="track"><i style={{ transform: `scaleX(${pct})` }} /></div>
          </div>
          <div className="scores">
            <div className="score"><span className="lab">You</span><b>{g.me.score}</b><small>{g.me.best ? `Best: ${g.me.best.word.toUpperCase()} +${g.me.best.pts}` : ''}</small></div>
            {g.house && <div className="score"><span className="lab">House ({g.level})</span><b>{g.house.score}</b><small>{g.houseLast}</small></div>}
          </div>
        </div>
        <div className="word" aria-label="Your word">
          {g.sel.length
            ? g.sel.map((i, k) => <Tile key={k} letter={g.me.rack[i]} className="small" onClick={() => removeAt(k)} />)
            : <span className="empty">Tap tiles or type letters to spell a word</span>}
        </div>
        <div className="rack" aria-label="Your tiles">
          {g.me.rack.map((letter, i) => {
            const cls = g.tradeMode ? (g.tradeSel[i] ? 'pick' : '') : (g.sel.includes(i) ? 'used' : '');
            return <Tile key={i} letter={letter} className={cls} onClick={() => tapTile(i)} />;
          })}
        </div>
        <div className={g.msg.kind ? `msg ${g.msg.kind}` : 'msg'} role="status" aria-live="polite">{g.msg.text}</div>
        <div className="actions">
          <button className="btn primary" type="button" onClick={submit}>Play word</button>
          <button className="btn" type="button" onClick={clearWord}>Clear</button>
          <button className="btn" type="button" onClick={shuffle}>Shuffle</button>
          <button className="btn" type="button" onClick={openTrade}>Trade tiles (−{TRADE_COST})</button>
          <button className="btn quiet" type="button" onClick={end}>End game</button>
        </div>
        {g.tradeMode && (
          <div className="tradebar">
            <span>Tap the tiles you want to trade, then press Trade now. Each trade costs {TRADE_COST} points.</span>
            <div className="actions">
              <button className="btn primary" type="button" onClick={tradeNow}>Trade now</button>
              <button className="btn" type="button" onClick={selectAllTrade}>Select all</button>
              <button className="btn quiet" type="button" onClick={closeTrade}>Cancel</button>
            </div>
          </div>
        )}
        <div>
          <h3>Your words</h3>
          <ol className="log">
            {g.me.log.slice(0, 40).map((l) => <li key={l.word}>{l.word.toUpperCase()} <span className="pts">+{l.pts}</span></li>)}
          </ol>
        </div>
      </div>
    </section>
  );
}
