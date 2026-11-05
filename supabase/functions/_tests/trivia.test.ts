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
) {
  const clean = cleanAction(action);
  assert(clean, `action refused by cleanAction: ${JSON.stringify(action)}`);
  const moved = T.apply(joinSecret(stored.pub, stored.secret), { ...clean, id, name: id }, { bank, now });
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
  let stored = splitSecret(T.newRoom('room-1', bank.categories.length));
  let r = act(T, bank, stored, { type: 'join' }, 'maya', now);
  r = act(T, bank, r.stored, { type: 'start' }, 'maya', now);
  assert(r.error === 'You need at least 2 players.', 'one player cannot start');
  r = act(T, bank, r.stored, { type: 'join' }, 'jonah', now);
  r = act(T, bank, r.stored, { type: 'start' }, 'maya', now);
  stored = r.stored;
  assert(stored.pub.phase === 'spin', 'game starts with a spin');

  // Players are always right, so someone has to win within a bounded number of steps.
  for (let step = 0; step < 400 && stored.pub.phase !== 'over'; step++) {
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
    r = act(T, bank, stored, action, who, now);
    assert(!r.error, `${phase}: ${r.error}`);
    stored = r.stored;
  }
  assert(stored.pub.phase === 'over' && stored.pub.winner, 'someone wins');
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
});
