// Booking, credit, cancel, card and payment rules for the Schedule page, ported from assets/rules.js.
// The database enforces the same rules in supabase/schema.sql (book_session, cancel_booking). If you change a
// rule here, change it there too: rules that only run in the browser can be bypassed by anyone. In the database
// a Household member spends the account holder's credits; here one Member record holds the balance.
//
// Times are milliseconds since 1970 (Date.now()). "Week" and "month" are counted in the business time zone
// (cfg.tz), and a week runs Monday to Sunday, so every member shares the same week. Every function is pure:
// it takes a member record and returns a new one.

export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

export interface Config {
  tz: string;
  /** sessions included each billing month: Individual and Household (shared by everyone on it) */
  monthlyCredits: number;
  householdCredits: number;
  /** most monthly-credit sessions one person can book in one week; null = no weekly limit */
  maxWeeklySessions: number | null;
  /** free cancel up to this many hours before the start */
  cancelHours: number;
  /** after the cancel deadline: no cancel at all, or cancel with the credit and card used up */
  lateCancel: 'blocked' | 'forfeit';
  /** booking closes this long before the start */
  bookingClosesMinutes: number;
  bookAheadDays: number;
  /** Bad Hair Day cards per calendar month */
  bhdPerMonth: number;
  /** after a failed payment: days before future bookings are cancelled */
  graceDays: number;
  /** the join window opens this long before the start */
  joinOpensMinutes: number;
  /** and closes this long after it (rooms lock) */
  joinClosesMinutes: number;
}

// Change these numbers to change the policy. Everything below reads from here.
export const DEFAULT_CONFIG: Config = {
  tz: 'America/Chicago',
  monthlyCredits: 13,
  householdCredits: 16,
  maxWeeklySessions: 4,
  cancelHours: 24,
  lateCancel: 'forfeit',
  bookingClosesMinutes: 15,
  bookAheadDays: 14,
  bhdPerMonth: 3,
  graceDays: 3,
  joinOpensMinutes: 10,
  joinClosesMinutes: 10,
};
export const cfgOf = (c?: Partial<Config>): Config => ({ ...DEFAULT_CONFIG, ...c });

export type BookingStatus = 'booked' | 'cancelled' | 'late_cancelled' | 'payment_lapsed' | 'attended' | 'no_show';
export type CreditSource = 'monthly' | 'purchased';

export interface Booking {
  id: string;
  sessionId: string;
  title: string;
  start: number;
  end: number;
  source: CreditSource;
  /** Bad Hair Day card: camera may stay off */
  bhd: boolean;
  status: BookingStatus;
  bookedAt: number;
  cancelledAt?: number;
}
/** Extra (purchased) sessions only. The balance is the sum of delta. */
export interface LedgerRow {
  id: string;
  delta: number;
  reason: 'purchase' | 'spend' | 'refund';
  ref: string | null;
}
export interface Subscription {
  status: 'none' | 'active' | 'past_due' | 'canceled';
  /** end of the period the last payment covered */
  paidThrough: number | null;
  pastDueSince: number | null;
}
export interface Member {
  id: string;
  name: string;
  plan: 'individual' | 'household';
  /** monthly credits left in this billing month (refilled on the billing date, not carried over) */
  monthlyLeft: number;
  sub: Subscription;
  ledger: LedgerRow[];
  bookings: Booking[];
}
export interface Session {
  id: string;
  title: string;
  start: number;
  minutes: number;
  capacity: number;
}

// Bookings that still count against the weekly limit and the monthly card limit.
// Cancelled and payment_lapsed bookings are refunded, so they do not count.
const COUNTED: ReadonlySet<BookingStatus> = new Set(['booked', 'late_cancelled', 'attended', 'no_show']);

/* ---------- time zones ---------- */

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const formatters = new Map<string, Intl.DateTimeFormat>();

/** Wall-clock parts of an instant in a time zone. dow: 1 = Monday ... 7 = Sunday. */
export function parts(ts: number, tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    });
    formatters.set(tz, f);
  }
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(new Date(ts))) o[p.type] = p.value;
  return { y: +o.year!, m: +o.month!, d: +o.day!, hh: +o.hour! % 24, mm: +o.minute!, dow: WEEKDAY[o.weekday!]! };
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Local clock time in a zone to a real instant. */
export function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): number {
  const want = Date.UTC(y, m - 1, d, hh, mm);
  let guess = want;
  for (let i = 0; i < 3; i++) {
    const p = parts(guess, tz);
    guess += want - Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm);
  }
  return guess;
}

/** The Monday of the week that contains this instant, as "YYYY-MM-DD". */
export function weekKey(ts: number, c?: Partial<Config>): string {
  const p = parts(ts, cfgOf(c).tz);
  const monday = new Date(Date.UTC(p.y, p.m - 1, p.d) - (p.dow - 1) * DAY);
  return ymd(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate());
}
export function monthKey(ts: number, c?: Partial<Config>): string {
  const p = parts(ts, cfgOf(c).tz);
  return `${p.y}-${pad(p.m)}`;
}

/* ---------- member record ---------- */

export function emptyMember(id: string, name = ''): Member {
  return {
    id,
    name,
    plan: 'individual',
    monthlyLeft: 0,
    sub: { status: 'none', paidThrough: null, pastDueSince: null },
    ledger: [],
    bookings: [],
  };
}
export const planCredits = (member: Member, c?: Partial<Config>) =>
  member.plan === 'household' ? cfgOf(c).householdCredits : cfgOf(c).monthlyCredits;
const nextId = (prefix: string, list: readonly unknown[]) =>
  `${prefix}${list.length + 1}-${Math.random().toString(36).slice(2, 7)}`;

export const extraBalance = (member: Member) => member.ledger.reduce((n, r) => n + r.delta, 0);
function weeklyUsed(member: Member, wk: string, cfg: Config) {
  return member.bookings.filter((b) => COUNTED.has(b.status) && b.source === 'monthly' && weekKey(b.start, cfg) === wk)
    .length;
}
function bhdUsed(member: Member, mk: string, cfg: Config, exceptId?: string) {
  return member.bookings.filter(
    (b) => COUNTED.has(b.status) && b.bhd && b.id !== exceptId && monthKey(b.start, cfg) === mk,
  ).length;
}
export const cancelDeadline = (start: number, c?: Partial<Config>) => start - cfgOf(c).cancelHours * HOUR;

/* ---------- membership and payment ----------
 * Credits only work while the membership is paid. A session can be booked only if the
 * member is "active" and the session starts before sub.paidThrough (the end of the period the last payment
 * covered). That ties the calendar to the money: no payment, no new bookings.
 */
export type MembershipState = 'none' | 'paid' | 'needs_renewal' | 'grace' | 'lapsed' | 'ending';

export function membership(member: Member, now: number, c?: Partial<Config>) {
  const cfg = cfgOf(c);
  const s = member.sub;
  const graceEnds = s.pastDueSince ? s.pastDueSince + cfg.graceDays * DAY : null;
  let state: MembershipState = 'none';
  if (s.status === 'active' && s.paidThrough && s.paidThrough > now) state = 'paid';
  else if (s.status === 'active') state = 'needs_renewal';
  else if (s.status === 'past_due') state = graceEnds && now < graceEnds ? 'grace' : 'lapsed';
  else if (s.status === 'canceled') state = s.paidThrough && s.paidThrough > now ? 'ending' : 'lapsed';
  return { state, paidThrough: s.paidThrough || null, graceEnds, canBook: state === 'paid' || state === 'ending' };
}

export function summary(member: Member, now: number, c?: Partial<Config>) {
  const cfg = cfgOf(c);
  const wk = weekKey(now, cfg);
  return {
    membership: membership(member, now, cfg),
    weekKey: wk,
    weeklyUsed: weeklyUsed(member, wk, cfg),
    weeklyLimit: cfg.maxWeeklySessions,
    monthlyLeft: member.monthlyLeft,
    monthlyTotal: planCredits(member, cfg),
    extra: extraBalance(member),
    bhdUsed: bhdUsed(member, monthKey(now, cfg), cfg),
    bhdTotal: cfg.bhdPerMonth,
  };
}

/* ---------- booking ---------- */

export type BookingCode =
  | 'started'
  | 'closed'
  | 'too_far'
  | 'already'
  | 'overlap'
  | 'full'
  | 'payment'
  | 'beyond_paid'
  | 'week_full'
  | 'no_credit'
  | 'no_bhd';

export interface Check {
  ok: boolean;
  reasons: string[];
  /** first failure */
  code: BookingCode | null;
  source: CreditSource | null;
}

const isoDay = (ts: number) => new Date(ts).toISOString().slice(0, 10);

export function checkBooking(
  member: Member,
  session: Session,
  opts: { bhd?: boolean },
  now: number,
  c?: Partial<Config>,
  seatsTaken = 0,
): Check {
  const cfg = cfgOf(c);
  const reasons: string[] = [];
  let code: BookingCode | null = null;
  let source: CreditSource | null = null;
  const fail = (k: BookingCode, text: string) => {
    code ??= k;
    reasons.push(text);
  };
  const m = membership(member, now, cfg);

  if (session.start <= now) fail('started', 'This session has already started.');
  else if (session.start - now < cfg.bookingClosesMinutes * MIN)
    fail('closed', `Booking closed ${cfg.bookingClosesMinutes} minutes before the start.`);
  else if (session.start - now > cfg.bookAheadDays * DAY)
    fail('too_far', `You can book up to ${cfg.bookAheadDays} days ahead.`);

  const mineHere = member.bookings.some((b) => b.sessionId === session.id && b.status === 'booked');
  if (mineHere) fail('already', 'You already booked this session.');
  const end = session.start + session.minutes * MIN;
  if (
    member.bookings.some(
      (b) => b.status === 'booked' && b.sessionId !== session.id && b.start < end && session.start < b.end,
    )
  )
    fail('overlap', 'This overlaps another session you booked.');
  if (seatsTaken >= session.capacity && !mineHere) fail('full', 'This session is full.');

  // Money first: nothing can be booked without a paid membership.
  if (!m.canBook) {
    if (m.state === 'grace') fail('payment', 'Your last payment did not go through. Update your card to book again.');
    else if (m.state === 'needs_renewal') fail('payment', 'Your membership payment is due. Renew to book again.');
    else fail('payment', 'Start a membership to book sessions.');
  } else if (m.paidThrough !== null && session.start > m.paidThrough) {
    fail(
      'beyond_paid',
      m.state === 'ending'
        ? `Your membership ends on ${isoDay(m.paidThrough)}. Restart it to book later sessions.`
        : `Your membership is paid through ${isoDay(m.paidThrough)}. This session opens for booking after your next renewal.`,
    );
  }

  // Which credit pays for it. Extra sessions can go past the weekly limit.
  const weekOk =
    cfg.maxWeeklySessions === null || weeklyUsed(member, weekKey(session.start, cfg), cfg) < cfg.maxWeeklySessions;
  if (member.monthlyLeft > 0 && weekOk) source = 'monthly';
  else if (extraBalance(member) > 0) source = 'purchased';
  else if (member.monthlyLeft > 0)
    fail(
      'week_full',
      `You have booked ${cfg.maxWeeklySessions} sessions for that week. Add an extra session to book this one.`,
    );
  else fail('no_credit', "This month's sessions are used up. Add an extra session to keep booking.");

  if (opts.bhd && bhdUsed(member, monthKey(session.start, cfg), cfg) >= cfg.bhdPerMonth)
    fail('no_bhd', `You have used all ${cfg.bhdPerMonth} Bad Hair Day cards for that month.`);

  return { ok: reasons.length === 0, reasons, code, source };
}

type Result = { ok: true; member: Member; booking: Booking } | { ok: false; reasons: string[]; member: Member };

export function book(
  member: Member,
  session: Session,
  opts: { bhd?: boolean },
  now: number,
  c?: Partial<Config>,
  seatsTaken = 0,
): Result & { code?: BookingCode | null } {
  const cfg = cfgOf(c);
  const chk = checkBooking(member, session, opts, now, cfg, seatsTaken);
  if (!chk.ok || !chk.source) return { ok: false, reasons: chk.reasons, code: chk.code, member };
  const m = structuredClone(member);
  const b: Booking = {
    id: nextId('b', m.bookings),
    sessionId: session.id,
    title: session.title,
    start: session.start,
    end: session.start + session.minutes * MIN,
    source: chk.source,
    bhd: !!opts.bhd,
    status: 'booked',
    bookedAt: now,
  };
  m.bookings.push(b);
  if (chk.source === 'monthly') m.monthlyLeft -= 1;
  if (chk.source === 'purchased') m.ledger.push({ id: nextId('l', m.ledger), delta: -1, reason: 'spend', ref: b.id });
  return { ok: true, booking: b, member: m };
}

/* ---------- cancel ---------- */

export function cancel(
  member: Member,
  bookingId: string,
  now: number,
  c?: Partial<Config>,
): Result & { refunded?: boolean } {
  const cfg = cfgOf(c);
  const m = structuredClone(member);
  const b = m.bookings.find((x) => x.id === bookingId);
  if (!b || b.status !== 'booked') return { ok: false, reasons: ["That booking can't be cancelled."], member };
  if (b.start <= now) return { ok: false, reasons: ['This session has already started.'], member };
  if (now <= cancelDeadline(b.start, cfg)) {
    b.status = 'cancelled';
    b.cancelledAt = now;
    // Capped at the plan size, in case the booking was paid from the previous billing month.
    if (b.source === 'monthly') m.monthlyLeft = Math.min(m.monthlyLeft + 1, planCredits(m, cfg));
    if (b.source === 'purchased') m.ledger.push({ id: nextId('l', m.ledger), delta: 1, reason: 'refund', ref: b.id });
    return { ok: true, refunded: true, member: m, booking: b };
  }
  if (cfg.lateCancel === 'forfeit') {
    b.status = 'late_cancelled';
    b.cancelledAt = now;
    return { ok: true, refunded: false, member: m, booking: b };
  }
  return {
    ok: false,
    reasons: [`Cancelling closed ${cfg.cancelHours} hours before the start. Your seat is held for you.`],
    member,
  };
}

/* ---------- Bad Hair Day card ---------- */

// Turn the off-camera card on or off for a booking. Only until the cancel deadline, so a card can't be used
// at the last minute to hide.
export function setBhd(member: Member, bookingId: string, on: boolean, now: number, c?: Partial<Config>): Result {
  const cfg = cfgOf(c);
  const m = structuredClone(member);
  const b = m.bookings.find((x) => x.id === bookingId);
  if (!b || b.status !== 'booked') return { ok: false, reasons: ["That booking can't be changed."], member };
  if (now > cancelDeadline(b.start, cfg))
    return {
      ok: false,
      reasons: [`Cards can be added or removed until ${cfg.cancelHours} hours before the start.`],
      member,
    };
  if (on && !b.bhd && bhdUsed(m, monthKey(b.start, cfg), cfg, b.id) >= cfg.bhdPerMonth)
    return { ok: false, reasons: [`You have used all ${cfg.bhdPerMonth} Bad Hair Day cards for that month.`], member };
  b.bhd = on;
  return { ok: true, member: m, booking: b };
}

/* ---------- joining the room ---------- */

export function joinInfo(booking: Booking, now: number, c?: Partial<Config>) {
  const cfg = cfgOf(c);
  const opensAt = booking.start - cfg.joinOpensMinutes * MIN;
  const closesAt = booking.start + cfg.joinClosesMinutes * MIN;
  const state = booking.status !== 'booked' ? 'none' : now < opensAt ? 'early' : now <= closesAt ? 'open' : 'closed';
  // The video room starts with the camera required unless the card was used.
  return { state, opensAt, closesAt, camera: booking.bhd ? 'off_allowed' : 'required' } as const;
}

/* ---------- money events ---------- */

// Add purchased sessions. "ref" is the payment id, so the same payment can never add credits twice.
export function addExtra(member: Member, qty: number, ref: string | null) {
  if (ref && member.ledger.some((r) => r.ref === ref)) return { ok: true, duplicate: true, member };
  const m = structuredClone(member);
  m.ledger.push({ id: nextId('l', m.ledger), delta: qty, reason: 'purchase', ref });
  return { ok: true, duplicate: false, member: m };
}

/** A payment event from the payment processor. */
export type PaymentEvent =
  /** a payment succeeded (the billing month's credits arrive); paid through periodEnd */
  | { type: 'paid'; periodEnd: number }
  | { type: 'failed'; at: number }
  /** the member ended the membership; it stays valid until paidThrough */
  | { type: 'canceled' };

// The billing date never moves: a late payment brings the credits back, but the next refill stays on schedule.
export function applyPayment(member: Member, ev: PaymentEvent, c?: Partial<Config>): Member {
  const m = structuredClone(member);
  if (ev.type === 'paid') {
    m.sub = { status: 'active', paidThrough: ev.periodEnd, pastDueSince: null };
    m.monthlyLeft = planCredits(m, c);
  } else if (ev.type === 'failed') {
    m.sub = { status: 'past_due', paidThrough: m.sub.paidThrough, pastDueSince: m.sub.pastDueSince || ev.at };
    m.monthlyLeft = 0;
  } else m.sub = { status: 'canceled', paidThrough: m.sub.paidThrough, pastDueSince: null };
  return m;
}

// Run on a schedule. Cancels future bookings the member is no longer paid for and returns extra sessions.
export function enforcePayment(member: Member, now: number, c?: Partial<Config>) {
  const cfg = cfgOf(c);
  const m = structuredClone(member);
  const s = m.sub;
  const state = membership(m, now, cfg).state;
  const cancelled: string[] = [];
  for (const b of m.bookings) {
    if (b.status !== 'booked' || b.start <= now) continue;
    const lapsed = state === 'lapsed' || (state === 'ending' && s.paidThrough !== null && b.start > s.paidThrough);
    if (!lapsed) continue;
    b.status = 'payment_lapsed';
    b.cancelledAt = now;
    cancelled.push(b.id);
    if (b.source === 'purchased') m.ledger.push({ id: nextId('l', m.ledger), delta: 1, reason: 'refund', ref: b.id });
  }
  return { member: m, cancelled };
}
