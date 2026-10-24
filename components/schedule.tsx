'use client';

// Schedule screen, ported from calendar.html. It is a prototype: bookings are saved in this browser
// (localStorage) and no money moves. To go live, swap the store below for calls to the database; the rules
// in lib/schedule/rules.ts stay the same.
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import * as R from '@/lib/schedule/rules';
import { Button, Shell, cn } from './ui';

const CFG = R.cfgOf();
const { HOUR, DAY } = R;
const KEY = 'meetdoconnect.schedule.v1';
// Same prices as the membership page. Prototype only: nothing is charged.
const PACKS = [
  { qty: 1, price: 4 },
  { qty: 5, price: 15 },
] as const;
const CLOCK = [
  [0, 'Right now'],
  [12, '12 hours from now'],
  [24, '1 day from now'],
  [48, '2 days from now'],
  [72, '3 days from now'],
  [120, '5 days from now'],
] as const;
const PAY = {
  paid: 'Paid for the month',
  failed: 'Payment failed (grace period)',
  lapsed: 'Payment failed (grace over)',
  canceled: 'Cancelled (paid period remains)',
  none: 'No membership',
} as const;
type Pay = keyof typeof PAY;

const FIELD = 'min-h-11 max-w-full min-w-0 rounded-2xl border border-line-strong bg-bg px-3.5 py-2';
const LABEL = 'text-[0.82rem] font-bold text-muted';
const TAG = 'rounded-full bg-bg px-2.5 py-0.5 text-xs font-semibold text-muted ring-1 ring-line';
const SMALL = 'min-h-9 px-3.5 text-[0.88rem]';

/* ---------- sample schedule ----------
 * Central times by day of week (1 = Monday). On the live site this comes from the database. */
type Row = readonly [hour: number, minute: number, title: string, blurb: string, host: string];
const PATTERN: Record<number, readonly Row[]> = {
  1: [[19, 0, 'Quiet Work Hour', 'Body doubling: work beside others, cameras on', 'Maya']],
  2: [
    [19, 0, 'Skincare Reset', 'Simple routine, no products to buy', 'Member host'],
    [20, 30, 'Late Shift Body Doubling', 'Get the thing done, together', 'Member host'],
  ],
  3: [[19, 0, 'Craft Night', 'Make something small, prep card included', 'Jo']],
  4: [[19, 0, 'Writing Circle', 'Prompts, ten minutes, share if you like', 'Member host']],
  5: [[19, 0, 'Cook-Along', 'One pan, one dish, eat with company', 'Sam']],
  6: [
    [10, 0, 'Sketch and Chat', 'Draw what is on your desk', 'Member host'],
    [19, 0, 'Game Night', 'Word games and trivia in small rooms', 'Maya'],
  ],
  7: [[18, 0, 'Stretch and Wind Down', 'Slow movement and a calm talk', 'Jo']],
};
interface Slot extends R.Session {
  blurb: string;
  host: string;
  /** seats already taken by other people (sample numbers) */
  others: number;
}
function fnv(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
// Five weeks of sessions from the Monday of this week.
function makeSlots(now: number): Slot[] {
  const p = R.parts(now, CFG.tz);
  const monday = Date.UTC(p.y, p.m - 1, p.d) - (p.dow - 1) * DAY;
  const out: Slot[] = [];
  for (let n = 0; n < 35; n++) {
    const day = new Date(monday + n * DAY);
    const [y, m, d] = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()];
    for (const [hh, mm, title, blurb, host] of PATTERN[(n % 7) + 1] ?? []) {
      const id = `s${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}-${hh}${String(mm).padStart(2, '0')}`;
      const start = R.zonedToUtc(y, m, d, hh, mm, CFG.tz);
      out.push({ id, title, blurb, host, start, minutes: 60, capacity: 6, others: fnv(id) % 6 });
    }
  }
  return out;
}

/* ---------- the "server" ----------
 * The only place that stores data. Today it is this browser. */
interface Saved {
  member: R.Member;
  pay: Pay;
  clockH: number;
}
function withPayment(member: R.Member, pay: Pay, now: number): R.Member {
  let m: R.Member = { ...R.emptyMember('me', 'You'), ledger: member.ledger, bookings: member.bookings };
  const paid = (periodEnd: number) => (m = R.applyPayment(m, { type: 'paid', periodEnd }));
  if (pay === 'paid') paid(now + 30 * DAY);
  else if (pay === 'failed') {
    paid(now - HOUR);
    m = R.applyPayment(m, { type: 'failed', at: now - DAY });
  } else if (pay === 'lapsed') {
    paid(now - 8 * DAY);
    m = R.applyPayment(m, { type: 'failed', at: now - 6 * DAY });
  } else if (pay === 'canceled') {
    paid(now + 10 * DAY);
    m = R.applyPayment(m, { type: 'canceled' });
  }
  return R.enforcePayment(m, now, CFG).member;
}
const fresh = (): Saved => ({
  member: withPayment(R.emptyMember('me', 'You'), 'paid', Date.now()),
  pay: 'paid',
  clockH: 0,
});
function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null;
    if (s && Array.isArray(s.member?.bookings) && Array.isArray(s.member.ledger) && s.member.sub && s.pay in PAY)
      return s;
  } catch {
    /* unreadable: start over */
  }
  return fresh();
}

// One snapshot for the saved data and the minute it was read, refreshed every minute and after each change.
interface Snap {
  saved: Saved;
  at: number;
}
let snap: Snap | null = null;
const listeners = new Set<() => void>();
const getSnap = () => (snap ??= { saved: load(), at: Date.now() });
function store(saved: Saved) {
  snap = { saved, at: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* storage blocked: the bookings last until the page closes */
  }
  for (const l of listeners) l();
}
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const tick = setInterval(() => {
    snap = { ...getSnap(), at: Date.now() };
    onChange();
  }, 60_000);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    snap = null;
    onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    clearInterval(tick);
    window.removeEventListener('storage', onStorage);
  };
}

// The pretend clock: real time plus the hours picked in the prototype controls.
const clockNow = (hours: number) => Date.now() + hours * HOUR;
const paymentRef = (qty: number) => `demo_${Date.now()}_${qty}`;

/* ---------- formatting ---------- */
let viewerTz = '';
const tz = () => (viewerTz ||= Intl.DateTimeFormat().resolvedOptions().timeZone || CFG.tz);
const fmt = (ts: number, zone: string, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-US', { timeZone: zone, ...o }).format(new Date(ts));
const clock = (ts: number, zone = tz()) => fmt(ts, zone, { hour: 'numeric', minute: '2-digit' }).toLowerCase();
const timeLabel = (ts: number) => (tz() === CFG.tz ? `${clock(ts)} CT` : `${clock(ts)} (${clock(ts, CFG.tz)} CT)`);
const whenLabel = (ts: number) =>
  `${fmt(ts, tz(), { weekday: 'short', month: 'short', day: 'numeric' })}, ${timeLabel(ts)}`;
const shortDate = (ts: number) => fmt(ts, tz(), { month: 'short', day: 'numeric' });
const deadlineLabel = (start: number) => {
  const d = R.cancelDeadline(start, CFG);
  return `${fmt(d, tz(), { weekday: 'short' })} ${clock(d)}`;
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function membershipStat(m: ReturnType<typeof R.membership>) {
  const pd = m.paidThrough ? shortDate(m.paidThrough) : '';
  switch (m.state) {
    case 'paid':
      return { head: 'Active', sub: `Paid through ${pd}`, tone: '' };
    case 'needs_renewal':
      return { head: 'Payment due', sub: 'Renew to keep booking', tone: 'warn' };
    case 'grace':
      return {
        head: 'Payment failed',
        sub: `Update your card by ${shortDate(m.graceEnds ?? 0)} to keep your sessions`,
        tone: 'bad',
      };
    case 'ending':
      return { head: `Ending ${pd}`, sub: 'You can book sessions until then', tone: 'warn' };
    case 'lapsed':
      return { head: 'Membership paused', sub: 'Renew to book sessions', tone: 'bad' };
    default:
      return { head: 'No membership', sub: 'Start one to book sessions', tone: 'warn' };
  }
}

function Stat({ label, tone, children }: { label: string; tone?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'grid content-start gap-0.5 rounded-2xl bg-surface px-4 py-3 ring-1 ring-line',
        tone === 'warn' && 'bg-warn-bg ring-sun',
        tone === 'bad' && 'bg-bad/10 ring-bad',
      )}
    >
      <span className="text-[0.72rem] font-bold tracking-[0.12em] text-muted uppercase">{label}</span>
      {children}
    </div>
  );
}

export default function Schedule() {
  const current = useSyncExternalStore(subscribe, getSnap, () => null);
  const [week, setWeek] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; bhd: boolean } | null>(null);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);

  if (!current) {
    return (
      <Shell as="section" aria-label="Sessions" className="mt-8">
        <p className="text-muted">Loading your schedule…</p>
      </Shell>
    );
  }

  const { saved } = current;
  // Real time, not the pretend clock: the sample sessions stay put while the clock moves.
  const slots = makeSlots(current.at);
  const member = saved.member;
  const now = current.at + saved.clockH * HOUR;
  const demoNow = () => clockNow(saved.clockH);
  const say = (text: string, bad = false) => setNote(text ? { text, bad } : null);
  const keep = (m: R.Member) => store({ ...saved, member: m });

  const weeks = [...new Set(slots.map((s) => R.weekKey(s.start, CFG)))];
  const shown = week && weeks.includes(week) ? week : R.weekKey(now, CFG);
  const idx = weeks.indexOf(shown);
  const [y, mo, d] = shown.split('-').map(Number) as [number, number, number];
  const weekLabel = `${fmt(Date.UTC(y, mo - 1, d), 'UTC', { month: 'short', day: 'numeric' })} – ${fmt(Date.UTC(y, mo - 1, d + 6), 'UTC', { month: 'short', day: 'numeric' })}`;
  // The strip counts the week on screen, using its Thursday noon.
  const sum = R.summary(member, R.zonedToUtc(y, mo, d + 3, 12, 0, CFG.tz), CFG);
  const mem = membershipStat(R.membership(member, now, CFG));
  const weeklyLeft = Math.max(0, sum.weeklyTotal - sum.weeklyUsed);

  const byDay = new Map<string, Slot[]>();
  for (const s of slots.filter((x) => R.weekKey(x.start, CFG) === shown)) {
    const k = fmt(s.start, tz(), { weekday: 'long', month: 'short', day: 'numeric' });
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  const upcoming = member.bookings
    .filter((b) => b.status === 'booked' && b.end > now)
    .sort((a, b) => a.start - b.start);
  const mine = (sid: string) => member.bookings.find((b) => b.sessionId === sid && b.status === 'booked');

  function goWeek(step: number) {
    setWeek(weeks[Math.min(weeks.length - 1, Math.max(0, idx + step))] ?? null);
    setConfirm(null);
    setNote(null);
  }
  function book(s: Slot, bhd: boolean) {
    const r = R.book(member, s, { bhd }, demoNow(), CFG, s.others);
    if (!r.ok) return say(r.reasons[0] ?? '', true);
    keep(r.member);
    setConfirm(null);
    say(`Booked: ${s.title}, ${whenLabel(s.start)}. ${bhd ? 'Bad Hair Day card used.' : 'Camera on.'}`);
  }
  function cancel(id: string) {
    const r = R.cancel(member, id, demoNow(), CFG);
    if (!r.ok) return say(r.reasons[0] ?? '', true);
    keep(r.member);
    say(
      r.refunded
        ? 'Cancelled. Your session and any card were returned.'
        : 'Cancelled. Your session and card were used.',
    );
  }
  function toggleBhd(b: R.Booking) {
    const r = R.setBhd(member, b.id, !b.bhd, demoNow(), CFG);
    if (!r.ok) return say(r.reasons[0] ?? '', true);
    keep(r.member);
    say(
      r.booking.bhd
        ? 'Bad Hair Day card added. Camera can stay off.'
        : 'Card removed. Camera on, and the card is back in your pocket.',
    );
  }
  function buy(qty: number) {
    if (!R.membership(member, demoNow(), CFG).canBook)
      return say('Extra sessions are for active members. Start or renew your membership first.', true);
    keep(R.addExtra(member, qty, paymentRef(qty)).member);
    say(`Added ${plural(qty, 'extra session')} (prototype, nothing was charged).`);
  }
  function join(b: R.Booking) {
    const camera = R.joinInfo(b, demoNow(), CFG).camera;
    say(
      `On the live site this opens the video room. ${camera === 'required' ? 'Your camera is required to enter.' : 'You can enter with your camera off today.'}`,
    );
  }
  function setPay(pay: Pay) {
    store({ ...saved, pay, member: withPayment(member, pay, demoNow()) });
    setNote(null);
  }
  function setClock(clockH: number) {
    store({ ...saved, clockH, member: R.enforcePayment(member, clockNow(clockH), CFG).member });
    setWeek(null);
    setNote(null);
  }
  function reset() {
    store(fresh());
    setWeek(null);
    setConfirm(null);
    say('Prototype reset.');
  }

  function confirmBox(s: Slot) {
    const bhd = confirm?.bhd ?? false;
    const chk = R.checkBooking(member, s, { bhd }, now, CFG, s.others);
    const at = R.summary(member, s.start, CFG);
    const cardsLeft = Math.max(0, at.bhdTotal - at.bhdUsed);
    const cost =
      chk.source === 'weekly'
        ? `Uses 1 of your ${CFG.weeklyCredits} sessions for that week.`
        : chk.source === 'purchased'
          ? `That week's ${CFG.weeklyCredits} sessions are used. This will use 1 extra session (you have ${at.extra}).`
          : '';
    return (
      <div className="grid gap-2.5 rounded-2xl border border-dashed border-accent bg-surface p-3.5">
        {cost && <p className="font-bold">{cost}</p>}
        <label className="flex items-start gap-2.5 font-semibold">
          <input
            type="checkbox"
            checked={bhd}
            disabled={cardsLeft === 0 && !bhd}
            onChange={(e) => setConfirm({ id: s.id, bhd: e.target.checked })}
            className="mt-1 size-4.5 accent-accent"
          />
          <span>
            Use a Bad Hair Day card (camera off)
            <small className="block font-normal text-muted">
              {cardsLeft} of {at.bhdTotal} left this month. Otherwise your camera is on: it&apos;s how we connect.
            </small>
          </span>
        </label>
        {chk.reasons.map((r) => (
          <p key={r} className="font-semibold text-bad">
            {r}
          </p>
        ))}
        {chk.code === 'no_credit' && (
          <div>
            <Button className={SMALL} onClick={() => buy(1)}>
              Buy 1 extra session (${PACKS[0].price})
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={!chk.ok} onClick={() => book(s, bhd)}>
            Confirm booking
          </Button>
          <Button variant="quiet" onClick={() => setConfirm(null)}>
            Never mind
          </Button>
        </div>
      </div>
    );
  }

  function sessionCard(s: Slot) {
    const b = mine(s.id);
    const past = s.start <= now;
    const left = Math.max(0, s.capacity - s.others - (b ? 1 : 0));
    const ji = b && R.joinInfo(b, now, CFG);
    const canChange = now <= R.cancelDeadline(s.start, CFG);
    return (
      <article
        key={s.id}
        className={cn(
          'grid gap-2 rounded-card bg-bg p-4 ring-1 ring-line',
          b && 'bg-accent-soft ring-accent',
          past && 'opacity-55',
        )}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2.5">
          <span className="font-bold tabular-nums">{timeLabel(s.start)}</span>
          <span className="text-[0.88rem] text-muted">
            {past ? 'Started' : left ? `${plural(left, 'seat')} left` : 'Full'}
          </span>
        </div>
        <div>
          <h4 className="text-[1.15rem]">{s.title}</h4>
          <p className="text-[0.88rem] text-muted">
            {s.blurb} · Host: {s.host} · {s.minutes} min
          </p>
        </div>
        {b && ji && (
          <>
            <div className="flex flex-wrap gap-1.5">
              <span className={cn(TAG, 'bg-accent text-accent-fg ring-accent')}>Booked</span>
              <span className={cn(TAG, 'bg-sun-soft text-sun-ink ring-sun')}>
                {b.bhd ? 'Bad Hair Day: camera off' : 'Camera on'}
              </span>
              <span className={TAG}>{b.source === 'weekly' ? 'Weekly session' : 'Extra session'}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {ji.state === 'open' && (
                <Button variant="primary" onClick={() => join(b)}>
                  Join room
                </Button>
              )}
              {ji.state === 'early' && (
                <span className="text-[0.86rem] text-muted">Room opens at {clock(ji.opensAt)}</span>
              )}
              {canChange ? (
                <>
                  <Button className={SMALL} onClick={() => toggleBhd(b)}>
                    {b.bhd ? 'Remove Bad Hair Day card' : 'Use a Bad Hair Day card'}
                  </Button>
                  <Button variant="quiet" className={SMALL} onClick={() => cancel(b.id)}>
                    Cancel (free until {deadlineLabel(s.start)})
                  </Button>
                </>
              ) : past ? null : CFG.lateCancel === 'forfeit' ? (
                <Button variant="quiet" className={SMALL} onClick={() => cancel(b.id)}>
                  Cancel (your session and card are used up)
                </Button>
              ) : (
                <span className="text-[0.86rem] text-muted">
                  Cancel window closed {deadlineLabel(s.start)}. Your seat is held for you.
                </span>
              )}
            </div>
          </>
        )}
        {!b && !past && confirm?.id === s.id && confirmBox(s)}
        {!b && !past && confirm?.id !== s.id && (
          <div>
            <Button
              variant="primary"
              disabled={!left}
              onClick={() => {
                setConfirm({ id: s.id, bhd: false });
                setNote(null);
              }}
            >
              {left ? 'Book' : 'Full'}
            </Button>
          </div>
        )}
      </article>
    );
  }

  return (
    <div className="grid gap-4.5 pt-[clamp(24px,4vw,40px)]">
      <section aria-label="Your membership" className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2.5">
        <Stat label="Membership" tone={mem.tone}>
          <b className="font-display text-[1.15rem] leading-tight">{mem.head}</b>
          <small className="text-muted">{mem.sub}</small>
        </Stat>
        <Stat label="Sessions this week">
          <div aria-hidden="true" className="flex gap-1.5 py-0.5">
            {Array.from({ length: sum.weeklyTotal }, (_, i) => (
              <span
                key={i}
                className={cn('size-4 rounded-full border-2 border-accent', i < weeklyLeft && 'bg-accent')}
              />
            ))}
          </div>
          <b className="font-display text-[1.15rem] leading-tight">
            {weeklyLeft} of {sum.weeklyTotal} left
          </b>
        </Stat>
        <Stat label="Extra sessions">
          <b className="font-display text-[1.15rem] leading-tight">{sum.extra}</b>
          <small className="text-muted">Don&apos;t expire</small>
        </Stat>
        <Stat label="Bad Hair Day cards">
          <b className="font-display text-[1.15rem] leading-tight">
            {Math.max(0, sum.bhdTotal - sum.bhdUsed)} of {sum.bhdTotal} left
          </b>
          <small className="text-muted">This month, 1 per session</small>
        </Stat>
      </section>
      <p
        role="status"
        aria-live="polite"
        className={cn(
          'rounded-2xl px-4 py-2.5 font-semibold empty:hidden',
          note?.bad ? 'bg-bad/10 text-bad' : 'bg-accent-soft',
        )}
      >
        {note?.text}
      </p>

      <div className="grid items-start gap-4.5 lg:grid-cols-[7fr_5fr]">
        <Shell as="section" aria-label="Sessions">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <Button disabled={idx <= 0} onClick={() => goWeek(-1)}>
              ← Earlier
            </Button>
            <h2 className="order-first basis-full text-center text-[1.35rem] sm:order-none sm:flex-1 sm:basis-auto">
              {weekLabel}
            </h2>
            <Button disabled={idx >= weeks.length - 1} onClick={() => goWeek(1)}>
              Later →
            </Button>
          </div>
          <p className="text-[0.86rem] text-muted">
            Weeks run Monday to Sunday in Central Time. Times show in your time zone
            {tz() === CFG.tz ? '.' : ' with Central in brackets.'}
          </p>
          {byDay.size ? (
            [...byDay].map(([label, list]) => (
              <div key={label} className="grid gap-2">
                <h3 className="font-sans text-[0.85rem] font-bold tracking-[0.06em] text-muted uppercase">{label}</h3>
                {list.map(sessionCard)}
              </div>
            ))
          ) : (
            <p className="text-muted">No sessions this week.</p>
          )}
        </Shell>

        <div className="grid gap-4.5">
          <Shell as="section" aria-label="Your upcoming sessions">
            <h2 className="text-[1.35rem]">Your upcoming sessions</h2>
            {upcoming.length ? (
              <ul className="grid gap-2">
                {upcoming.map((b) => (
                  <li key={b.id} className="rounded-2xl bg-bg px-3.5 py-2.5 ring-1 ring-line">
                    <b>{b.title}</b>
                    <small className="block text-muted">
                      {whenLabel(b.start)} · {b.bhd ? 'camera off (card)' : 'camera on'} ·{' '}
                      {b.source === 'weekly' ? 'weekly' : 'extra'}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">Nothing booked yet.</p>
            )}
          </Shell>

          <Shell as="section" aria-label="Extra sessions">
            <h2 className="text-[1.35rem]">Need an extra session?</h2>
            <p className="text-[0.9rem] text-muted">
              Extra sessions add to a week where you already used your three. They don&apos;t expire, and you get one
              back if you cancel in time.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {PACKS.map(({ qty, price }) => (
                <Button key={qty} onClick={() => buy(qty)}>
                  {plural(qty, 'extra session')} · ${price}
                </Button>
              ))}
            </div>
            <p className="text-[0.82rem] text-muted">Prototype: no payment is taken.</p>
          </Shell>

          <details className="rounded-card bg-sun-soft px-4.5 py-3 ring-1 ring-sun">
            <summary className="font-bold">Prototype controls (remove before launch)</summary>
            <div className="grid gap-3 pt-3 pb-1">
              <p className="text-[0.86rem] text-muted">
                Nothing here is real. Bookings are saved in this browser only, and no money moves. Use these controls to
                see how the calendar behaves.
              </p>
              <div className="grid gap-1.5">
                <label htmlFor="payState" className={LABEL}>
                  Payment status
                </label>
                <select
                  id="payState"
                  value={saved.pay}
                  onChange={(e) => setPay(e.target.value as Pay)}
                  className={FIELD}
                >
                  {Object.entries(PAY).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="clock" className={LABEL}>
                  Pretend it is
                </label>
                <select
                  id="clock"
                  value={saved.clockH}
                  onChange={(e) => setClock(Number(e.target.value) || 0)}
                  className={FIELD}
                >
                  {CLOCK.map(([h, label]) => (
                    <option key={h} value={h}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Button onClick={reset}>Reset prototype</Button>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
