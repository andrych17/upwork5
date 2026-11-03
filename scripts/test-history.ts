// Checks the admin credit timeline without a browser: npm test (Node runs the TypeScript directly)
import assert from 'node:assert/strict';
import { creditHistory, type BookingRow, type PaymentRow } from '../lib/credit-history.ts';

const OWNER = 'owner';
const booking = (over: Partial<BookingRow>): BookingRow => ({
  user_id: OWNER,
  status: 'confirmed',
  credit_type: 'monthly',
  created_at: '2026-11-01T10:00:00Z',
  cancelled_at: null,
  release_reason: null,
  session: { title: 'Idea Lab' },
  seat: { first_name: 'Nina', last_name: 'Patel' },
  ...over,
});
const payment = (over: Partial<PaymentRow>): PaymentRow => ({
  kind: 'plan',
  description: 'Solo monthly',
  extra_sessions: null,
  status: 'paid',
  refunded_at: null,
  refund_reason: null,
  created_at: '2026-10-01T10:00:00Z',
  ...over,
});

// Newest first, with the right number on each line.
const events = creditHistory(
  [{ amount: 2, reason: 'Sorry about the video', created_at: '2026-11-02T09:00:00Z' }],
  [
    payment({}),
    payment({
      kind: 'extras',
      description: '5 extra sessions',
      extra_sessions: 5,
      status: 'refunded',
      refunded_at: '2026-11-02T12:00:00Z',
      refund_reason: 'Asked',
    }),
  ],
  [
    booking({}),
    booking({
      created_at: '2026-11-01T11:00:00Z',
      status: 'cancelled',
      cancelled_at: '2026-11-01T12:00:00Z',
      release_reason: 'Hello Video declined',
    }),
    booking({
      created_at: '2026-11-01T13:00:00Z',
      status: 'late_cancelled',
      cancelled_at: '2026-11-01T14:00:00Z',
      credit_type: 'addon',
    }),
  ],
  OWNER,
);
assert.equal(events.length, 9); // 1 grant + 3 payment lines + 5 booking lines
assert.deepEqual(
  events.map((e) => e.at),
  [...events.map((e) => e.at)].sort().reverse(),
);
const by = (label: string) => events.find((e) => e.label.startsWith(label));
assert.equal(by('Credits given')?.delta, 2);
assert.equal(by('Extra sessions bought')?.delta, 5);
assert.equal(by('Plan payment')?.delta, null);
assert.equal(by('Payment refunded')?.detail, '5 extra sessions · unused extra sessions taken back · Asked');
assert.equal(
  events.filter((e) => e.label === 'Booked Idea Lab').every((e) => e.delta === -1),
  true,
);
assert.equal(events.find((e) => e.detail.startsWith('credit returned'))?.delta, 1);
assert.equal(events.find((e) => e.detail.startsWith('credit kept'))?.delta, 0);

// A Household person's booking is labelled with who sat, the holder's own is not.
const hh = creditHistory(
  [],
  [],
  [booking({ user_id: 'sam', seat: { first_name: 'Sam', last_name: 'Patel' } }), booking({})],
  OWNER,
);
assert.ok(hh.some((e) => e.detail.includes('for Sam Patel')));
assert.ok(hh.some((e) => e.detail === 'monthly credit'));

console.log('history checks: ok');
