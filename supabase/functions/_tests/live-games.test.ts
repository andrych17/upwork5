// deno test supabase/functions/_tests/live-games.test.ts (bash supabase/tests/run-deno.sh runs it in Docker)
// Plays Kelly's live-room games the way game-act does: clean the move, apply it to the saved state, then save the
// views. Players never get the seed, and each game still runs correctly from what was saved.
import {
  cleanMove,
  engine,
  type GameKey,
  type GameState,
  gameData,
  isGame,
  newRoom,
  timeoutTooEarly,
  viewsOf,
} from '../_shared/live-games.ts';

function assert(ok: unknown, label: string): asserts ok {
  if (!ok) throw new Error(label);
}

const START = Date.UTC(2026, 10, 23, 1, 0);
const ENDS = START + 60 * 60_000;

interface Acted {
  error: string | null;
  state: GameState;
  pub?: GameState;
  own?: Record<string, GameState>;
}

/** One game-act call. Returns the error text, or the new state plus what was saved for players. */
function act(game: GameKey, state: GameState, raw: Record<string, unknown>, id: string, now: number): Acted {
  const move = cleanMove(game, raw);
  if (!move) return { error: 'refused by cleanMove', state };
  const moved = engine(game).apply(state, { ...move, id, name: id }, { ...gameData(game), now, endsAt: ENDS });
  if (!moved.ok) return { error: moved.error, state };
  const views = viewsOf(game, moved.state, now);
  const text = JSON.stringify(views);
  assert(!text.includes('"rng"'), `${game}: the seed leaked into what players read`);
  return { error: null, state: moved.state, ...views };
}

Deno.test('every game key the server knows has its engine loaded', () => {
  assert(isGame('invent-it'), 'Invent It is playable');
  assert(isGame('guess-whose-story'), 'Guess Whose Story is playable');
  assert(isGame('puzzle-room'), 'Puzzle Room is playable');
  assert(isGame('draw-and-guess'), 'Draw and Guess is playable');
  assert(!isGame('trivia'), 'unknown games are refused');
  assert(engine('invent-it').DEFAULT_CONFIG.maxPlayers === 12, 'Kelly’s 2 to 12 players');
});

Deno.test('cleanMove keeps only the fields a move can carry', () => {
  assert(
    cleanMove('invent-it', { type: 'rate', value: 4, id: 'someone-else' })?.id === undefined,
    'no id from the page',
  );
  assert(cleanMove('invent-it', { type: 'rate', value: 4 })?.value === 4, 'rating kept');
  assert(cleanMove('invent-it', { type: 'rate', value: 9 }) === null, 'rating out of range');
  assert(cleanMove('invent-it', { type: 'rate', value: '4' }) === null, 'rating must be a number');
  assert(cleanMove('invent-it', { type: 'pick', cat: 2 })?.cat === 2, 'category pick kept');
  assert(cleanMove('invent-it', { type: 'mode', mode: 'choose' })?.mode === 'choose', 'team mode kept');
  assert(cleanMove('invent-it', { type: 'mode', mode: 'all' }) === null, 'unknown team mode');
  assert(cleanMove('invent-it', { type: 'team', team: -1 })?.team === -1, 'leave a team');
  assert(cleanMove('invent-it', { type: 'toString' }) === null, 'no inherited names');
  assert(cleanMove('invent-it', { type: 'guessed', who: 'x' }) === null, 'another game’s move');
  assert(cleanMove('invent-it', ['join']) === null && cleanMove('invent-it', null) === null, 'not a move');
});

Deno.test('Invent It: a whole game through save and load, until the session ends', () => {
  const game: GameKey = 'invent-it';
  let s = newRoom(game, 'session-1');
  let now = START;
  const step = (raw: Record<string, unknown>, id: string, ms = 500) => {
    now += ms;
    const r = act(game, s, raw, id, now);
    assert(!r.error, `${raw.type} by ${id}: ${r.error}`);
    s = JSON.parse(JSON.stringify(r.state)); // what game_rooms gives back
    return r;
  };
  const players = ['ann', 'bob', 'cat', 'dan', 'eve'];
  for (const p of players) step({ type: 'join' }, p);
  step({ type: 'join' }, 'ann'); // a reload: nothing changes
  assert((s.players ?? []).length === 5, 'five players, no duplicate after a reload');
  let r = step({ type: 'start' }, 'bob');
  assert(s.phase === 'stage' && (s.endsAt as number) === ENDS, 'game ends with the session');
  const ui = () => (r.pub as { ui: Record<string, unknown> }).ui;
  const phase = (): string => String(s.phase);
  assert(Array.isArray(ui().board) && (ui().board as unknown[]).length === 2, 'two teams for five players');
  assert(Object.keys(r.own ?? {}).length === 0, 'Invent It has no hidden parts, so no own views');

  let rounds = 0;
  let guard = 0;
  while (phase() !== 'over' && guard++ < 2000) {
    const st = s.stage as { turn: number; team: number; cats: number[] | null } | null;
    if (s.phase === 'stage' && st?.turn === -2) {
      const names = ui().catNames as string[];
      assert(names.length === 3 && names.every((n) => n.length > 0), 'three named categories in the huddle');
      const team = (s.players as { id: string; team: number }[]).filter((p) => p.team === st.team);
      for (const p of team) r = step({ type: 'pick', cat: 1 }, p.id);
      assert(ui().catName === names[1], 'the tapped category wins and its name goes to the page');
      continue;
    }
    if (s.phase === 'stage') {
      const who =
        (ui().speaker as string | null) ??
        (s.players as { id: string; team: number }[]).find((p) => p.team === st?.team)?.id;
      r = step({ type: 'next' }, who ?? 'ann');
      continue;
    }
    if (s.phase === 'rate') {
      for (const id of ui().raters as string[]) if (s.phase === 'rate') r = step({ type: 'rate', value: 4 }, id);
      continue;
    }
    if (s.phase === 'results') {
      rounds++;
      assert(typeof ui().more === 'boolean', 'results say whether another round fits');
      r = step({ type: 'nextround' }, 'cat');
      continue;
    }
    if (s.phase === 'break') {
      // Nobody presses anything: the timer moves the game on once the break is over.
      r = step({ type: 'timeout' }, 'dan', (s.deadline as number) - now + 10);
      continue;
    }
    throw new Error(`unexpected phase ${s.phase}`);
  }
  assert(phase() === 'over', 'the game ends');
  assert(rounds >= 2, `several rounds fit in the hour (${rounds})`);
  const teams = s.teams as { total: number }[];
  assert(
    teams.every((t) => t.total > 0),
    'every team scored',
  );
  assert((s.winners as number[]).length >= 1, 'someone wins');
});

Deno.test('Invent It: a timeout before the deadline is refused, so many pages can send it safely', () => {
  let s = newRoom('invent-it', 'session-2');
  for (const p of ['ann', 'bob']) s = act('invent-it', s, { type: 'join' }, p, START).state;
  s = act('invent-it', s, { type: 'start' }, 'ann', START).state;
  const early = act('invent-it', s, { type: 'timeout' }, 'bob', START + 1000);
  assert(early.error === 'Not yet.', 'not before the deadline');
  const late = act('invent-it', s, { type: 'timeout' }, 'bob', (s.deadline as number) + 1);
  assert(!late.error && late.state.phase === 'stage', 'after the deadline the huddle closes');
});

// ---------- Guess Whose Story ----------
interface StoryCur {
  part: string[];
  yes: Record<string, boolean>;
  votes: Record<string, string>;
  mystery: string | null;
  isMystery?: boolean;
  result: { mystery: string | null; yes: Record<string, boolean> } | null;
}
const curOf = (v: GameState | undefined) => v?.cur as StoryCur;

/** Plays a game one step at a time like game-act, and checks every saved view for the times-picked count. */
function storyGame(players: string[]) {
  let s = newRoom('guess-whose-story', 'session-3');
  let now = START;
  let last: Acted = { error: null, state: s };
  const step = (raw: Record<string, unknown>, id: string, ms = 20_000) => {
    now += ms;
    const r = act('guess-whose-story', s, raw, id, now);
    assert(!r.error, `${raw.type} by ${id}: ${r.error}`);
    assert(
      !JSON.stringify([r.pub, r.own]).includes('"myst"'),
      'times picked is never sent (it names the mystery person)',
    );
    s = JSON.parse(JSON.stringify(r.state));
    last = r;
  };
  for (const p of players) step({ type: 'join' }, p, 100);
  step({ type: 'start' }, players[0], 100);
  return {
    step,
    get s() {
      return s;
    },
    get last() {
      return last;
    },
    get now() {
      return now;
    },
  };
}

Deno.test('cleanMove: Guess Whose Story moves', () => {
  const k: GameKey = 'guess-whose-story';
  assert(isGame(k), 'Guess Whose Story is playable');
  assert(cleanMove(k, { type: 'answer', value: true })?.value === true, 'yes kept');
  assert(cleanMove(k, { type: 'answer', value: 1 }) === null, 'an answer is yes or no');
  assert(cleanMove(k, { type: 'vote', target: '0d3c6c1e-6b1a-4c4e-9f43-3c2b1a0e9d11' })?.target, 'a player id');
  assert(cleanMove(k, { type: 'vote', target: 'y' })?.target === 'y', 'yes or no with two players');
  assert(cleanMove(k, { type: 'vote', target: { id: 'x' } }) === null, 'not a name');
  assert(cleanMove(k, { type: 'vote', target: 'a b' }) === null, 'not an id');
  assert(cleanMove(k, { type: 'rate', value: 3 }) === null, 'Invent It’s move');
});

Deno.test('Guess Whose Story: answers, the mystery person and guesses stay secret until the reveal', () => {
  const players = ['ann', 'bob', 'cat', 'dan'];
  const g = storyGame(players);
  let reveals = 0;
  let guard = 0;
  while (String(g.s.phase) !== 'over' && guard++ < 3000) {
    const cur = curOf(g.s);
    if (g.s.phase === 'answer') {
      // Everyone but Dan says Yes, so Dan is never the mystery person.
      for (const p of cur.part) if (g.s.phase === 'answer') g.step({ type: 'answer', value: p !== 'dan' }, p);
      continue;
    }
    if (g.s.phase === 'talk') {
      const pub = curOf(g.last.pub);
      assert(
        pub.mystery === null && !pub.isMystery && !Object.keys(pub.yes).length,
        'shared view: no answers, no mystery',
      );
      for (const p of cur.part) {
        const mine = curOf(g.last.own?.[p] ?? g.last.pub);
        assert(Object.keys(mine.yes).join() === p, `${p} sees only their own answer`);
        assert(Boolean(mine.isMystery) === (p === cur.mystery), `${p} is told only whether they were picked`);
        assert(mine.mystery === (p === cur.mystery ? p : null), `${p} cannot read who was picked`);
      }
      g.step({ type: 'next' }, 'dan');
      continue;
    }
    if (g.s.phase === 'vote') {
      const m = cur.mystery as string;
      for (const p of cur.part) {
        if (p === m || g.s.phase !== 'vote') continue;
        g.step({ type: 'vote', target: p === 'dan' ? m : players.find((x) => x !== p && x !== m) }, p);
        if (g.s.phase === 'vote')
          assert(!Object.keys(curOf(g.last.pub).votes).length, 'guesses hidden until all are in');
      }
      continue;
    }
    if (g.s.phase === 'reveal') {
      reveals++;
      const r = curOf(g.last.pub).result;
      assert(
        r?.mystery === cur.mystery && r?.yes.dan === false,
        'the reveal shows everyone the mystery person and answers',
      );
      g.step({ type: 'next' }, 'bob');
      continue;
    }
    if (g.s.phase === 'results') {
      assert(typeof (g.last.pub?.ui as { more: unknown }).more === 'boolean', 'results say whether another round fits');
      g.step({ type: 'nextround' }, 'cat');
      continue;
    }
    if (g.s.phase === 'break') {
      g.step({ type: 'timeout' }, 'dan', (g.s.deadline as number) - g.now + 10);
      continue;
    }
    throw new Error(`unexpected phase ${g.s.phase}`);
  }
  assert(String(g.s.phase) === 'over' && reveals >= 6, `a whole round at least (${reveals} questions)`);
  assert((g.s.winners as string[]).join() === 'dan', 'Dan guessed right every time and wins');
  const ui = g.last.pub?.ui as { board: Record<string, unknown>[] };
  assert(ui.board[0].id === 'dan' && !('picked' in ui.board[0]), 'scoreboard without times picked');
});

Deno.test('Guess Whose Story: with two players each guesses the other one’s answer', () => {
  const g = storyGame(['ann', 'bob']);
  assert(curOf(g.s).part.length === 2 && (g.s.cur as { mode: string }).mode === 'spot', 'two-player version');
  g.step({ type: 'answer', value: true }, 'ann');
  g.step({ type: 'answer', value: false }, 'bob');
  const phase = (): string => String(g.s.phase);
  assert(phase() === 'talk', 'both answered');
  assert(!Object.keys(curOf(g.last.pub).yes).length, 'answers hidden');
  assert(curOf(g.last.own?.ann).yes.ann === true && curOf(g.last.own?.ann).yes.bob === undefined, 'Ann sees her own');
  g.step({ type: 'next' }, 'bob');
  g.step({ type: 'vote', target: 'y' }, 'bob');
  g.step({ type: 'vote', target: 'y' }, 'ann');
  assert(phase() === 'reveal', 'both guessed');
  // Bob guessed Ann's Yes (3), and Ann guessed Yes for Bob's No, so Bob fooled her (1 more).
  const score = (id: string) => (g.s.players as { id: string; score: number }[]).find((p) => p.id === id)?.score;
  assert(score('bob') === 4 && score('ann') === 0, `scores ${score('bob')} and ${score('ann')}`);
  assert(curOf(g.last.pub).result?.yes.bob === false, 'the reveal shows both answers');
});

// ---------- Puzzle Room ----------
Deno.test('cleanMove: Puzzle Room moves', () => {
  const k: GameKey = 'puzzle-room';
  assert(isGame(k), 'Puzzle Room is playable');
  assert(cleanMove(k, { type: 'guess', option: 3 })?.option === 3, 'one of the four answers');
  assert(cleanMove(k, { type: 'guess', option: 4 }) === null, 'only four answers');
  assert(cleanMove(k, { type: 'guess', option: '1' }) === null, 'an answer is a number');
  assert(cleanMove(k, { type: 'hint', option: 2 })?.option === undefined, 'a hint carries nothing');
  assert(cleanMove(k, { type: 'giveup' })?.type === 'giveup', 'give up');
  assert(cleanMove(k, { type: 'pick', cat: 2 })?.cat === 2, 'category pick');
  assert(cleanMove(k, { type: 'rate', value: 3 }) === null, 'Invent It’s move');
});

Deno.test('Puzzle Room: the right answer never reaches the page, only the Reader taps, points add up', () => {
  const game: GameKey = 'puzzle-room';
  let s = newRoom(game, 'session-4');
  let now = START;
  let r: Acted = { error: null, state: s };
  const step = (raw: Record<string, unknown>, id: string, ms = 500) => {
    now += ms;
    r = act(game, s, raw, id, now);
    assert(!r.error, `${raw.type} by ${id}: ${r.error}`);
    const text = JSON.stringify([r.pub, r.own]);
    assert(!text.includes('"correct"') && !text.includes('"pz"'), 'no answer key in what players read');
    s = JSON.parse(JSON.stringify(r.state));
  };
  const tryMove = (raw: Record<string, unknown>, id: string) => act(game, s, raw, id, now).error;
  for (const p of ['ann', 'bob', 'cat', 'dan']) step({ type: 'join' }, p);
  step({ type: 'mode', mode: 'choose' }, 'ann');
  step({ type: 'team', team: 0 }, 'ann');
  step({ type: 'team', team: 0 }, 'bob');
  step({ type: 'team', team: 2 }, 'cat');
  step({ type: 'team', team: 2 }, 'dan');
  step({ type: 'start' }, 'cat');
  assert(Object.keys(r.own ?? {}).length === 0, 'everyone sees the same thing');
  const phase = (): string => String(s.phase);
  const stage = () =>
    s.stage as { team: number; turn: number; reader: string; correct: number; crossed: number[]; shown: string[] };
  const ui = () => (r.pub as { ui: { catNames: string[]; catName: string | null; hintsLeft: number } }).ui;
  const team = (t: number) =>
    (s.players as { id: string; team: number }[]).filter((p) => p.team === t).map((p) => p.id);

  const first = stage().team;
  assert(ui().catNames.length === 3 && ui().catNames.every(Boolean), 'three named categories');
  for (const id of team(first)) step({ type: 'pick', cat: 0 }, id);
  assert(ui().catName === ui().catNames[0], 'the tapped category wins and its name goes to the page');
  const other = team(1 - first)[0];
  assert(tryMove({ type: 'next' }, other) !== null, 'the other team cannot start the clock');
  step({ type: 'next' }, team(first)[0]);
  assert(stage().turn === 0, 'the clock runs');

  const reader = stage().reader;
  const mate = team(first).find((id) => id !== reader)!;
  assert(tryMove({ type: 'guess', option: 0 }, mate) !== null, 'only the Reader taps');
  assert(tryMove({ type: 'guess', option: 0 }, other) !== null, 'the other team only watches');
  const left = ui().hintsLeft;
  step({ type: 'hint' }, reader);
  assert(stage().shown.length === 1, 'the hint is shown');
  assert(ui().hintsLeft === left - 1, 'one hint fewer left');
  const wrong = [0, 1, 2, 3].find((o) => o !== stage().correct)!;
  step({ type: 'guess', option: wrong }, reader);
  assert(stage().crossed.includes(wrong), 'a wrong tap is crossed out');
  step({ type: 'guess', option: stage().correct }, reader, 1000);
  assert(phase() === 'reveal', 'solved');
  const rev = s.reveal as { solved: boolean; points: number; bonus: number; answer: string };
  // 10, minus 3 for the hint and 2 for the wrong tap, plus the speed bonus.
  assert(rev.solved && rev.points === 5 + rev.bonus && rev.bonus > 0, `points ${rev.points}`);
  assert((r.pub as { reveal: { answer: string } }).reveal.answer === rev.answer, 'the answer is shown after');

  // The second team gives up and scores nothing.
  step({ type: 'next' }, other);
  for (const id of team(1 - first)) step({ type: 'pick', cat: 1 }, id);
  step({ type: 'next' }, other);
  step({ type: 'giveup' }, stage().reader);
  assert((s.reveal as { points: number }).points === 0, 'giving up scores 0');
  step({ type: 'next' }, 'ann');
  assert(phase() === 'results', 'round results after every team');
  assert(typeof (r.pub as { ui: { more: unknown } }).ui.more === 'boolean', 'results say whether another round fits');
});

// ---------- Draw and Guess ----------
Deno.test('cleanMove: Draw and Guess moves', () => {
  const k: GameKey = 'draw-and-guess';
  const line = { c: 2, w: 1, p: [10, 20, 30, 40] };
  assert(cleanMove(k, { type: 'stroke', stroke: line })?.stroke !== undefined, 'a line is kept');
  assert(cleanMove(k, { type: 'live', stroke: line })?.type === 'live', 'a line in progress is kept');
  const kept = cleanMove(k, { type: 'stroke', stroke: { ...line, extra: 'x' }, id: 'someone-else' });
  assert(JSON.stringify(kept?.stroke) === JSON.stringify(line) && kept?.id === undefined, 'only c, w and p ride along');
  assert(cleanMove(k, { type: 'stroke', stroke: { ...line, c: 6 } }) !== null, 'the eraser is colour 6');
  assert(cleanMove(k, { type: 'stroke', stroke: { ...line, c: 7 } }) === null, 'unknown colour');
  assert(cleanMove(k, { type: 'stroke', stroke: { ...line, w: 3 } }) === null, 'unknown width');
  assert(cleanMove(k, { type: 'stroke', stroke: { ...line, p: [1, 2, 3] } }) === null, 'points come in pairs');
  assert(cleanMove(k, { type: 'stroke', stroke: { ...line, p: [] } }) === null, 'a line has a point');
  assert(cleanMove(k, { type: 'stroke', stroke: { ...line, p: [1, 2.5] } }) === null, 'whole numbers only');
  assert(cleanMove(k, { type: 'stroke', stroke: { ...line, p: [1, 1001] } }) === null, 'inside the 1000 square');
  assert(cleanMove(k, { type: 'stroke', stroke: { ...line, p: [1, '2'] } }) === null, 'numbers, not text');
  assert(cleanMove(k, { type: 'stroke', stroke: { ...line, p: Array(1600).fill(5) } }) !== null, '800 points fit');
  assert(cleanMove(k, { type: 'stroke', stroke: { ...line, p: Array(1602).fill(5) } }) === null, 'but not 801');
  assert(cleanMove(k, { type: 'stroke' }) === null && cleanMove(k, { type: 'stroke', stroke: 5 }) === null, 'no line');
  assert(cleanMove(k, { type: 'choose', i: 2 })?.i === 2, 'one of three words');
  assert(cleanMove(k, { type: 'choose', i: 3 }) === null, 'only three words');
  assert(cleanMove(k, { type: 'guessed', who: 'user-1' })?.who === 'user-1', 'the artist taps a name');
  assert(cleanMove(k, { type: 'guessed', who: { $ne: 1 } }) === null, 'a name is text');
  assert(
    cleanMove(k, { type: 'undo' })?.type === 'undo' && cleanMove(k, { type: 'clear' })?.type === 'clear',
    'undo, clear',
  );
  assert(cleanMove(k, { type: 'rate', value: 3 }) === null, 'another game’s move');
});

Deno.test('a timeout before the step’s time is up is ignored, but not once the session has ended', () => {
  const s = { phase: 'choose', deadline: START + 12_000 };
  assert(timeoutTooEarly(s, { type: 'timeout' }, START + 1000), 'too early');
  assert(!timeoutTooEarly(s, { type: 'timeout' }, START + 12_000), 'on the deadline');
  assert(!timeoutTooEarly(s, { type: 'timeout' }, START + 2000, START + 1000), 'the session is over');
  assert(!timeoutTooEarly(s, { type: 'start' }, START + 1000), 'only timeouts are held back');
  assert(!timeoutTooEarly({ phase: 'lobby', deadline: 0 }, { type: 'timeout' }, START), 'no clock in the lobby');
});

Deno.test('Draw and Guess: only the artist sees the word, only the artist draws, points add up', () => {
  const game: GameKey = 'draw-and-guess';
  let s = newRoom(game, 'session-5');
  let now = START;
  let r: Acted = { error: null, state: s };
  const phase = (): string => String(s.phase);
  const word = () => (s.turn as { word: string | null }).word;
  const turn = () =>
    s.turn as {
      artist: string;
      options: { w: string; cat: string }[];
      rerolled: boolean;
      guessed: { id: string; pts: number }[];
      strokes: unknown[];
      live: unknown;
    };
  // What the page of anyone but the artist may hold: not the word, nor the three offered words.
  let secrets: string[] = [];
  const step = (raw: Record<string, unknown>, id: string, ms = 500) => {
    now += ms;
    r = act(game, s, raw, id, now);
    assert(!r.error, `${raw.type} by ${id}: ${r.error}`);
    s = JSON.parse(JSON.stringify(r.state));
    if (phase() === 'choose' || phase() === 'draw') {
      const t = turn();
      secrets = [...t.options.map((o) => o.w), ...(word() ? [word() as string] : [])];
      const everyone = JSON.stringify(r.pub);
      for (const w of secrets) assert(!everyone.includes(`"${w}"`), `"${w}" reached the shared view`);
      for (const [id2, v] of Object.entries(r.own ?? {})) {
        assert(id2 === t.artist, 'only the artist has a view of their own');
        assert(JSON.stringify(v).includes(`"${secrets[0]}"`), 'the artist sees the words');
      }
      assert(!JSON.stringify(r.pub).includes('usedWords'), 'the list of used words is not sent');
    }
  };
  const tryMove = (raw: Record<string, unknown>, id: string) => act(game, s, raw, id, now).error;
  const players = ['ann', 'bob', 'cat', 'dan'];
  for (const p of players) step({ type: 'join' }, p);
  assert(tryMove({ type: 'start' }, 'zed') !== null, 'only players in the room start');
  step({ type: 'start' }, 'bob');
  assert(phase() === 'choose', 'the first artist chooses');
  const artist = turn().artist;
  const guessers = players.filter((p) => p !== artist);
  assert(Object.keys(r.own ?? {}).join() === artist, 'the artist alone has a different view');
  assert(turn().options.length === 3, 'three words to pick from');
  assert(tryMove({ type: 'choose', i: 0 }, guessers[0]) !== null, 'only the artist chooses');
  assert(tryMove({ type: 'reroll' }, guessers[0]) !== null, 'only the artist asks for new words');
  const first = turn().options.map((o) => o.w);
  step({ type: 'reroll' }, artist);
  assert(
    turn().rerolled &&
      turn()
        .options.map((o) => o.w)
        .join() !== first.join(),
    'three new words',
  );
  assert(tryMove({ type: 'reroll' }, artist) !== null, 'new words only once');
  step({ type: 'choose', i: 1 }, artist);
  assert(phase() === 'draw' && word() !== null, 'drawing starts');
  const secret = word() as string;

  // The page's other players see "?" and no words.
  const watcher = (r.pub as { turn: { word: string; options: unknown[]; cat: unknown } }).turn;
  assert(watcher.word === '?' && watcher.options.length === 0 && watcher.cat === null, 'guessers see a question mark');

  const line = { c: 1, w: 0, p: [100, 100, 300, 300, 500, 100] };
  assert(tryMove({ type: 'stroke', stroke: line }, guessers[0]) !== null, 'only the artist draws');
  assert(tryMove({ type: 'live', stroke: line }, guessers[0]) !== null, 'only the artist draws live');
  assert(
    tryMove({ type: 'undo' }, guessers[0]) !== null && tryMove({ type: 'clear' }, guessers[0]) !== null,
    'nor undo',
  );
  step({ type: 'live', stroke: line }, artist);
  assert(turn().live !== null, 'the line in progress is shown to guessers');
  step({ type: 'stroke', stroke: line }, artist);
  step({ type: 'stroke', stroke: { c: 6, w: 2, p: [300, 300] } }, artist);
  assert(turn().strokes.length === 2 && turn().live === null, 'two lines (one an eraser dab), live cleared');
  step({ type: 'undo' }, artist);
  assert(turn().strokes.length === 1, 'undo takes the last line');
  step({ type: 'clear' }, artist);
  assert(turn().strokes.length === 0, 'clear wipes the drawing');
  step({ type: 'stroke', stroke: line }, artist);
  assert((r.pub as { turn: { strokes: unknown[] } }).turn.strokes.length === 1, 'guessers get the drawing');

  // Points: the first third of the time is 5, the second 3; the artist gets 2 each.
  assert(tryMove({ type: 'guessed', who: guessers[0] }, guessers[1]) !== null, 'only the artist awards');
  assert(tryMove({ type: 'guessed', who: artist }, artist) !== null, 'not for themselves');
  assert(tryMove({ type: 'guessed', who: 'nobody' }, artist) !== null, 'someone in the room');
  step({ type: 'guessed', who: guessers[0] }, artist, 1000);
  assert(tryMove({ type: 'guessed', who: guessers[0] }, artist) !== null, 'once each');
  now = (s.turn as unknown as { start: number }).start + 30_000;
  step({ type: 'guessed', who: guessers[1] }, artist, 0);
  assert(
    turn()
      .guessed.map((g) => g.pts)
      .join() === '5,3',
    'fast guess 5, middle third 3',
  );
  const board = (r.pub as { ui: { board: { id: string; score: number }[] } }).ui.board;
  assert(board.find((x) => x.id === artist)?.score === 4, 'the artist earns 2 for each guesser');
  step({ type: 'guessed', who: guessers[2] }, artist, 0);
  assert(phase() === 'reveal', 'everyone guessed: the turn ends');
  assert(JSON.stringify(r.pub).includes(`"${secret}"`), 'the word is shown to everyone after the turn');
  assert(tryMove({ type: 'stroke', stroke: line }, artist) !== null, 'no drawing after the turn');

  // An early timeout while the next artist chooses changes nothing (game-act holds it back); a late one picks a word.
  step({ type: 'timeout' }, 'bob', (s.deadline as number) - now + 1);
  assert(phase() === 'choose', 'the next artist is choosing');
  assert(timeoutTooEarly(s, { type: 'timeout' }, now), 'a timeout now would be too early');
});
