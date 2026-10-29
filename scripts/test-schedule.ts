// Checks the Schedule rules without a browser: npm test (Node runs the TypeScript directly)
import assert from 'node:assert/strict';
import * as R from '../lib/schedule/rules.ts';

type Done = Extract<ReturnType<typeof R.book>, { ok: true }>;
function done(r: ReturnType<typeof R.book | typeof R.cancel | typeof R.setBhd>): Done {
  assert.ok(r.ok, r.ok ? '' : r.reasons.join(' '));
  return r as Done;
}
// [y, m, d, hh, mm] in Central time
const T = (y: number, m: number, d: number, hh: number, mm = 0) => R.zonedToUtc(y, m, d, hh, mm, 'America/Chicago');
const { HOUR: H, DAY: D } = R;

// Week and month keys around the clock change (CDT to CST on 1 Nov 2026).
assert.equal(R.weekKey(T(2026, 11, 1, 23, 30)), '2026-10-26');
assert.equal(R.weekKey(T(2026, 11, 2, 0, 10)), '2026-11-02');
assert.equal(R.monthKey(T(2026, 10, 31, 23, 30)), '2026-10');
assert.equal(new Date(T(2026, 11, 2, 18, 30)).toISOString(), '2026-11-03T00:30:00.000Z');

const now = T(2026, 10, 26, 9); // Monday morning
const s = (id: string, d: number, hh: number): R.Session => ({
  id,
  title: id,
  start: T(2026, 10, d, hh),
  minutes: 60,
  capacity: 6,
});
let m = R.applyPayment(R.emptyMember('u1'), { type: 'paid', periodEnd: now + 30 * D });
assert.equal(m.monthlyLeft, 13);
assert.equal(
  R.applyPayment({ ...R.emptyMember('h1'), plan: 'household' }, { type: 'paid', periodEnd: now }).monthlyLeft,
  16,
);

// 4 sessions in one week from the monthly credits, then the 5th needs an extra session.
for (const [id, d] of [
  ['w1', 27],
  ['w2', 28],
  ['w3', 29],
  ['w4', 30],
] as const) {
  const r = done(R.book(m, s(id, d, 18), {}, now));
  assert.equal(r.booking.source, 'monthly');
  m = r.member;
}
assert.equal(m.monthlyLeft, 9);
assert.equal(R.book(m, s('w5', 31, 18), {}, now).code, 'week_full');
// With no weekly limit the 5th still comes from the monthly credits.
assert.equal(done(R.book(m, s('w5', 31, 18), {}, now, { maxWeeklySessions: null })).booking.source, 'monthly');
m = R.addExtra(m, 1, 'pay_1').member;
assert.equal(R.addExtra(m, 1, 'pay_1').duplicate, true, 'the same payment adds credits once');
const w5 = done(R.book(m, s('w5', 31, 18), {}, now));
assert.equal(w5.booking.source, 'purchased', 'an extra session can go past the weekly limit');
m = w5.member;
assert.equal(R.extraBalance(m), 0);
// The limit resets on Monday (Central time).
const n1 = done(R.book(m, { ...s('n1', 2, 18), start: T(2026, 11, 2, 18) }, {}, now));
assert.equal(n1.booking.source, 'monthly');
m = n1.member;
assert.equal(R.summary(m, now).weeklyUsed, 4);
assert.equal(R.summary(m, now).monthlyLeft, 8);
// Out of monthly credits and extras: the month is used up.
assert.equal(R.book({ ...m, monthlyLeft: 0 }, s('z', 31, 10), {}, now).code, 'no_credit');

// Other checks: overlap, a full session, too far ahead, closing 15 minutes before.
assert.equal(R.book(m, { ...s('o', 27, 18), id: 'o' }, {}, now).code, 'overlap');
assert.equal(R.book(m, s('full', 31, 10), {}, now, undefined, 6).code, 'full');
assert.equal(R.book(m, { ...s('far', 26, 18), start: now + 15 * D }, {}, now).code, 'too_far');
assert.equal(R.book(m, { ...s('soon', 26, 9), start: now + 10 * R.MIN }, {}, now).code, 'closed');

// A free cancel more than 24 hours ahead returns the credit it used.
const cancelled = R.cancel(m, w5.booking.id, now);
assert.ok(cancelled.ok && cancelled.refunded);
m = cancelled.member;
assert.equal(R.extraBalance(m), 1);
const backN1 = R.cancel(m, n1.booking.id, now);
assert.ok(backN1.ok && backN1.refunded);
assert.equal(backN1.member.monthlyLeft, 9);
// Inside 24 hours the cancel goes through but the credit is used, and it still counts for that week.
const w1 = m.bookings[0]!;
const forfeit = R.cancel(m, w1.id, w1.start - 2 * H);
assert.ok(forfeit.ok && !forfeit.refunded);
assert.equal(forfeit.member.monthlyLeft, m.monthlyLeft);
assert.equal(R.summary(forfeit.member, now).weeklyUsed, 4);
// With lateCancel "blocked" there is no late cancel at all.
assert.equal(R.cancel(m, w1.id, w1.start - 2 * H, { lateCancel: 'blocked' }).ok, false);

// Cards only until the 24-hour deadline, and the room then lets the camera stay off.
assert.equal(R.setBhd(m, w1.id, true, w1.start - 2 * H).ok, false);
m = done(R.setBhd(m, w1.id, true, now)).member;
assert.equal(R.joinInfo(m.bookings[0]!, w1.start).camera, 'off_allowed');
assert.equal(R.joinInfo(m.bookings[1]!, m.bookings[1]!.start).camera, 'required');
assert.equal(R.joinInfo(m.bookings[0]!, w1.start - 11 * R.MIN).state, 'early');
assert.equal(R.joinInfo(m.bookings[0]!, w1.start + 11 * R.MIN).state, 'closed');
assert.equal(R.summary(m, now).bhdUsed, 1);

// A failed payment blocks new bookings, and after the 3-day grace the future bookings are cancelled.
m = R.applyPayment(m, { type: 'failed', at: now });
assert.equal(m.monthlyLeft, 0);
assert.equal(R.membership(m, now + 2 * D).state, 'grace');
assert.equal(R.book(m, s('x', 31, 18), {}, now).code, 'payment');
assert.equal(R.enforcePayment(m, now + 2 * D).cancelled.length, 0);
const late = R.enforcePayment(m, now + 3 * D + 1);
assert.deepEqual(
  late.cancelled,
  m.bookings.filter((b) => b.status === 'booked' && b.start > now + 3 * D + 1).map((b) => b.id),
);
assert.equal(late.cancelled.length, 3, 'w3 (Thu 29 Oct), w4 (Fri 30 Oct) and n1 (Mon 2 Nov) are still ahead');

// A cancelled membership stays bookable until the paid period ends, not after it.
let c = R.applyPayment(R.emptyMember('u2'), { type: 'paid', periodEnd: now + 3 * D });
c = R.applyPayment(c, { type: 'canceled' });
assert.equal(R.membership(c, now).state, 'ending');
assert.ok(R.book(c, s('a', 27, 18), {}, now).ok);
assert.equal(R.book(c, s('b', 30, 18), {}, now).code, 'beyond_paid');

console.log('schedule ok');
