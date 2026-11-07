// deno test supabase/functions/_tests/trivia.test.ts (bash supabase/tests/run-deno.sh runs it in Docker)
// Plays whole games the way trivia-act does: the stored state never holds the answer order or the seed,
// and the engine still runs correctly after every save/load round trip.
import {
  type Bank,
  cleanAction,
  engine,
  type GameState,
  joinSecret,
  type Secret,
  splitSecret,
} from '../_shared/trivia-room.ts';

function assert(ok: unknown, label: string): asserts ok {
  if (!ok) throw new Error(label);
}

const raw = {
  categories: [
    { id: 'geo', name: 'Geography', color: '#2E86AB' },
    { id: 'hist', name: 'History', color: '#C1666B' },
  ],
  questions: ['geo', 'hist'].flatMap((cat) =>
    Array.from({ length: 6 }, (_, i) => ({
      id: `${cat}-${i}`,
      cat,
      q: `${cat} question ${i}?`,
      a: `right ${i}`,
      wrong: [`wrong ${i}a`, `wrong ${i}b`, `wrong ${i}c`],
    })),
  ),
};

type Stored = { pub: GameState; secret: Secret };

// One trivia-act call: load, apply, split, save.
function act(
  T: ReturnType<typeof engine>,
  bank: Bank,
  stored: Stored,
  action: Record<string, unknown>,
  id: string,
  now: number,
  endsAt?: number,
) {
  const clean = cleanAction(action);
  assert(clean, `action refused by cleanAction: ${JSON.stringify(action)}`);
  const moved = T.apply(joinSecret(stored.pub, stored.secret), { ...clean, id, name: id }, { bank, now, endsAt });
  if (!moved.ok) return { error: moved.error, stored };
  const split = splitSecret(moved.state);
  const card = T.cardFor(moved.state, bank) as { choices: string[] } | null;
  const text = JSON.stringify(split.pub) + JSON.stringify(card);
  assert(!text.includes('"order"') && !text.includes('"rng"'), 'answer order or seed leaked into what players read');
  return { error: null, stored: split, card };
}

Deno.test('a full two-player game runs through save and load without leaking answers', () => {
  const T = engine();
  const checked = T.validateBank(raw);
  assert(checked.ok, checked.errors.join('; '));
  const bank = checked.bank;
  let now = 1_000_000;
  // trivia-act passes the session's end (trivia_seat ends_at); Kelly's 7 Nov engine ends the game then.
  const endsAt = now + 60 * 60_000;
  let stored = splitSecret(T.newRoom('room-1', bank.categories.length));
  let r = act(T, bank, stored, { type: 'join' }, 'maya', now, endsAt);
  r = act(T, bank, r.stored, { type: 'start' }, 'maya', now, endsAt);
  assert(r.error === 'You need at least 2 players.', 'one player cannot start');
  r = act(T, bank, r.stored, { type: 'join' }, 'jonah', now, endsAt);
  r = act(T, bank, r.stored, { type: 'start' }, 'maya', now, endsAt);
  stored = r.stored;
  assert(stored.pub.phase === 'spin', 'game starts with a spin');
  assert(stored.pub.endsAt === endsAt, 'the game ends with the session, not 60 minutes after the room opened');

  // Players are always right: 10 points each, a badge (+5) after 4 right in a category, and no final question.
  for (let step = 0; step < 400; step++) {
    now += 1000;
    const players = stored.pub.players as { id: string }[];
    const who = players[stored.pub.turn as number].id;
    const phase = stored.pub.phase;
    let action: Record<string, unknown>;
    if (phase === 'spin') action = { type: 'spin' };
    else if (phase === 'move') action = { type: 'move', to: (stored.pub.options as number[])[0] };
    else {
      const right = (stored.secret.order ?? []).indexOf(0);
      assert(right >= 0, 'server still knows the right answer after a reload');
      action = { type: 'answer', choice: right };
    }
    r = act(T, bank, stored, action, who, now, endsAt);
    assert(!r.error, `${phase}: ${r.error}`);
    stored = r.stored;
  }
  assert(stored.pub.phase !== 'over', 'the game keeps going until the session ends');
  type P = { id: string; right: number; points: number; badges: boolean[]; catRight: number[] };
  for (const p of stored.pub.players as P[]) {
    const badges = p.badges.filter(Boolean).length;
    assert(p.points === p.right * 10 + badges * 5, `${p.id}: 10 a right answer + 5 a badge`);
    assert(
      p.badges.every((b, i) => b === p.catRight[i] >= 4),
      `${p.id}: badge after 4 right in a category`,
    );
  }

  r = act(T, bank, stored, { type: 'timeout' }, 'jonah', endsAt + 500, endsAt);
  assert(!r.error && r.stored.pub.phase === 'over', 'any move after the session end finishes the game');
  const players = r.stored.pub.players as P[];
  const top = Math.max(...players.map((p) => p.points));
  const winners = r.stored.pub.winners as string[];
  assert(
    winners.length > 0 && winners.every((id) => players.find((p) => p.id === id)?.points === top),
    'the highest score wins, ties share the win',
  );
  r = act(T, bank, r.stored, { type: 'again' }, 'maya', endsAt + 1000, endsAt);
  assert(
    act(T, bank, r.stored, { type: 'start' }, 'maya', endsAt + 1000, endsAt).error === 'The 60-minute session is over.',
    'no new game after the session',
  );
});

Deno.test('the Timer pauses the sand only after another player asks', () => {
  const T = engine();
  const bank = T.validateBank(raw).bank;
  let now = 1;
  const endsAt = now + 60 * 60_000;
  let r = act(T, bank, splitSecret(T.newRoom('room-3', 2)), { type: 'join' }, 'maya', now, endsAt);
  r = act(T, bank, r.stored, { type: 'join' }, 'jonah', now, endsAt);
  r = act(T, bank, r.stored, { type: 'join' }, 'nina', now, endsAt);
  r = act(T, bank, r.stored, { type: 'timer', on: true }, 'nina', now, endsAt);
  r = act(T, bank, r.stored, { type: 'start' }, 'maya', now, endsAt);
  r = act(T, bank, r.stored, { type: 'spin' }, 'maya', ++now, endsAt);
  if (r.stored.pub.phase === 'move')
    r = act(T, bank, r.stored, { type: 'move', to: (r.stored.pub.options as number[])[0] }, 'maya', ++now, endsAt);
  for (let i = 0; i < 5 && r.stored.pub.phase !== 'question'; i++) {
    // Landed on "spin again": spin and move until a question opens.
    r = act(T, bank, r.stored, { type: 'spin' }, 'maya', ++now, endsAt);
    if (r.stored.pub.phase === 'move')
      r = act(T, bank, r.stored, { type: 'move', to: (r.stored.pub.options as number[])[0] }, 'maya', ++now, endsAt);
  }
  assert(r.stored.pub.phase === 'question', 'Maya has a question');
  const pause = { type: 'clock', run: false };
  assert(act(T, bank, r.stored, pause, 'nina', ++now, endsAt).error?.includes('asks for a pause'), 'no request yet');
  assert(act(T, bank, r.stored, { type: 'pause' }, 'nina', now, endsAt).error, 'the Timer cannot ask for themselves');
  r = act(T, bank, r.stored, { type: 'pause' }, 'jonah', now, endsAt);
  assert(!r.error && (r.stored.pub.q as { pauseReq: string }).pauseReq === 'jonah', 'Jonah asked');
  assert(act(T, bank, r.stored, pause, 'jonah', now, endsAt).error, 'only the Timer pauses');
  r = act(T, bank, r.stored, pause, 'nina', ++now, endsAt);
  const q = r.stored.pub.q as { pauseReq: string | null; clock: { running: boolean } };
  assert(!r.error && !q.clock.running && q.pauseReq === null, 'Nina paused the sand and the request is cleared');
  r = act(T, bank, r.stored, { type: 'clock', run: true }, 'nina', ++now, endsAt);
  assert(!r.error && (r.stored.pub.q as typeof q).clock.running, 'and restarted it');
});

Deno.test('moves out of turn and early timeouts are refused', () => {
  const T = engine();
  const bank = T.validateBank(raw).bank;
  let r = act(T, bank, splitSecret(T.newRoom('room-2', 2)), { type: 'join' }, 'maya', 1);
  r = act(T, bank, r.stored, { type: 'join' }, 'jonah', 1);
  r = act(T, bank, r.stored, { type: 'start' }, 'maya', 1);
  assert(act(T, bank, r.stored, { type: 'spin' }, 'jonah', 2).error === "It is maya's turn.", 'not your turn');
  assert(
    act(T, bank, r.stored, { type: 'timeout' }, 'jonah', 2).error === 'Not yet.',
    'no timeout before the deadline',
  );
  const late = act(T, bank, r.stored, { type: 'timeout' }, 'jonah', 1 + 31_000);
  assert(!late.error && late.stored.pub.spins === 1, 'a late timeout spins for the player');
});

Deno.test('cleanAction keeps only known moves and fields', () => {
  assert(cleanAction({ type: 'drop table' }) === null, 'unknown type');
  assert(cleanAction(['join']) === null && cleanAction(null) === null, 'not an object');
  const a = cleanAction({ type: 'answer', choice: 2, id: 'someone-else', name: 'Admin' });
  assert(a && a.choice === 2 && !('id' in a) && !('name' in a), 'player id and name never come from the page');
  assert(cleanAction({ type: 'answer', choice: 9 })?.choice === undefined, 'choice out of range');
  assert(cleanAction({ type: 'move', to: -1 })?.to === undefined, 'negative space');
  const theme = cleanAction({ type: 'theme', cats: ['geo', 7, 'x'.repeat(100)] });
  assert(theme?.cats?.length === 2 && theme.cats[1].length === 40, 'theme cats are strings, trimmed');
  assert(cleanAction({ type: 'theme', random: 3 })?.random === 3, 'random theme');
  assert(
    cleanAction({ type: 'timer', on: false })?.on === false && cleanAction({ type: 'clock' })?.run === true,
    'switches',
  );
  assert(cleanAction({ type: 'pause' })?.type === 'pause', 'pause requests (7 Nov)');
});
