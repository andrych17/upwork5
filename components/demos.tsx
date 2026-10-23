'use client';

// The interactive prototypes on the public pages. Nothing here is saved, sent or charged.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ALLDAYS,
  BASE_CREDITS,
  DAYS,
  FULL,
  IDX,
  LATE_CANCEL_HOURS,
  PASSES_PER_MONTH,
  SESSIONS,
  activityHref,
  hoursUntil,
  type Day,
  type Session,
} from '@/lib/sessions';
import { Button, Lead, LiveDot, Section, SectionHead, Shell, cn } from './ui';

type PrefKey = 'prep' | 'e24' | 'e1' | 'text' | 'sunday';
type Prefs = Record<PrefKey, boolean>;

const PREFS: readonly [PrefKey, string][] = [
  ['prep', 'Prep card ready, 48 hours before'],
  ['e24', 'Email reminder, 24 hours before'],
  ['e1', 'Email reminder, 1 hour before'],
  ['text', 'Text reminder, 1 hour before'],
  ['sunday', 'Sunday afternoon: credits left this week'],
];
const PROMPTS = [
  'What is something you made or fixed recently, even badly?',
  'Which evening of your life would you happily repeat?',
  'What did you want to be good at when you were ten?',
  'What is one small thing you want to learn this month?',
  'What is the best thing you ate this week, and who were you with?',
] as const;
const FACES = [
  ['Pr', 'Priya'],
  ['Ma', 'Marcus'],
  ['Jo', 'Jo'],
  ['Da', 'Dana'],
  ['You', 'You'],
] as const;
const PICKS = [
  { name: 'Priya', pickedYou: true },
  { name: 'Marcus', pickedYou: false },
  { name: 'Jo', pickedYou: true },
  { name: 'Dana', pickedYou: false },
] as const;
const REASONS = ['Nudity or sexual content', 'Harassment or rudeness', 'Selling or spam', 'Something else'] as const;

const TAG = 'rounded-full bg-bg px-2.5 py-0.5 text-xs font-semibold text-muted';
const AVATAR =
  'grid size-13 shrink-0 place-items-center rounded-full bg-sun-soft font-display font-bold text-[#13241f] ring-2 ring-sun dark:text-fg';

interface Flash {
  id: string | null;
  text: string;
  tone?: 'ok' | 'warn';
}
const NO_FLASH: Flash = { id: null, text: '' };

const byId = (id: string): Session => {
  const s = SESSIONS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown session ${id}`);
  return s;
};
const oneHourBefore = (time: Session['time']) => (time === '6:30 pm' ? '5:30 pm' : '7:00 pm');
const dayBack = (day: Day, n: number) => ALLDAYS[(((IDX[day] - n) % 7) + 7) % 7];
const isLate = (s: Session) => hoursUntil(s) < LATE_CANCEL_HOURS;

function prepText(s: Session): string {
  return `${s.title} prep card (${s.cost})\n\nSupplies:\n- ${s.supplies.join('\n- ')}\n\nRun of show:\n- ${s.run.join('\n- ')}${s.safety ? `\n\n${s.safety}` : ''}`;
}

function reminders(s: Session, prefs: Prefs, cameraOff: boolean): string[] {
  const items = [
    'At booking: confirmation email with calendar invite',
    isLate(s)
      ? 'Inside 24 hours: cancelling now uses the credit'
      : `Free cancellation until ${dayBack(s.day, 1)} ${s.time}`,
  ];
  if (cameraOff) items.push('Bad Hair Day pass: you join with your camera off');
  if (prefs.prep) items.push(`Prep card ready: ${dayBack(s.day, 2)} ${s.time}`);
  if (prefs.e24) items.push(`Email reminder: ${dayBack(s.day, 1)} ${s.time}`);
  if (prefs.e1) items.push(`Email with join link: ${FULL[s.day]} ${oneHourBefore(s.time)}`);
  if (prefs.text) items.push(`Text with join link: ${FULL[s.day]} ${oneHourBefore(s.time)}`);
  items.push('After the session: who would you do this again with?');
  return items;
}

function CopyButton({ text }: { text: string }) {
  const [label, setLabel] = useState('Copy card text');
  const done = (message: string) => {
    setLabel(message);
    setTimeout(() => setLabel('Copy card text'), 1800);
  };
  const copy = () => {
    if (!navigator.clipboard) return done('Select the card text to copy');
    navigator.clipboard.writeText(text).then(
      () => done('Copied'),
      () => done('Select the card text to copy'),
    );
  };
  return (
    <Button variant="quiet" onClick={copy}>
      {label}
    </Button>
  );
}

function PrepCard({ s }: { s: Session }) {
  return (
    <details className="border-t border-line pt-3">
      <summary className="font-semibold text-accent">Prep card · {s.cost}</summary>
      <div className="mt-3 grid gap-3 text-[0.93rem]">
        <div>
          <h4 className="mb-1 font-sans text-[0.72rem] font-bold tracking-[0.14em] text-muted uppercase">Supplies</h4>
          <ul className="list-disc pl-5">
            {s.supplies.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="mb-1 font-sans text-[0.72rem] font-bold tracking-[0.14em] text-muted uppercase">
            Run of show
          </h4>
          <ol className="list-decimal pl-5">
            {s.run.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ol>
        </div>
        {s.safety && <p className="text-[0.88rem] text-warn">{s.safety}</p>}
        <div className="flex flex-wrap items-center gap-2.5">
          <CopyButton text={prepText(s)} />
        </div>
      </div>
    </details>
  );
}

// Calendar, credits, the Bad Hair Day pass and the reminder schedule share the bookings, so they live together.
export function Planner() {
  const [day, setDay] = useState<Day>('Mon');
  const [booked, setBooked] = useState<string[]>([]);
  const [extra, setExtra] = useState(0);
  const [lost, setLost] = useState(0); // credits spent by late cancellations
  const [passes, setPasses] = useState(PASSES_PER_MONTH);
  const [cameraOff, setCameraOff] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash>(NO_FLASH);
  const [prefs, setPrefs] = useState<Prefs>({ prep: true, e24: true, e1: true, text: false, sunday: true });

  const total = BASE_CREDITS + extra;
  const used = booked.length + lost;
  const left = total - used;
  const schedule = booked.map(byId).sort((x, y) => IDX[x.day] - IDX[y.day] || (x.time < y.time ? -1 : 1));

  function book(s: Session) {
    const clash = booked.some((id) => byId(id).day === s.day && byId(id).time === s.time);
    if (clash) setFlash({ id: s.id, text: 'You already have a session at this time. Cancel it to switch.' });
    else if (left <= 0) setFlash({ id: s.id, text: 'No credits left. Add a credit for $4 or cancel another booking.' });
    else {
      setBooked([...booked, s.id]);
      setFlash(NO_FLASH);
    }
  }

  // Drops the booking. A Bad Hair Day pass spent on going camera-off comes back, since the session won't happen.
  function release(s: Session): number {
    setBooked(booked.filter((b) => b !== s.id));
    setConfirming(null);
    if (!cameraOff.has(s.id)) return passes;
    const next = new Set(cameraOff);
    next.delete(s.id);
    setCameraOff(next);
    return passes + 1;
  }

  function cancel(s: Session) {
    if (isLate(s)) return setConfirming(s.id);
    setPasses(release(s));
    setFlash({ id: s.id, text: 'Cancelled. Your credit is back.', tone: 'ok' });
  }

  function cancelLate(s: Session, withPass: boolean) {
    const available = release(s);
    if (withPass) {
      setPasses(available - 1);
      setFlash({ id: s.id, text: 'Cancelled with your Bad Hair Day pass. Your credit is back.', tone: 'ok' });
    } else {
      setPasses(available);
      setLost(lost + 1);
      setFlash({ id: s.id, text: 'Cancelled inside 24 hours, so the credit is used.' });
    }
  }

  function goCameraOff(s: Session) {
    setPasses(passes - 1);
    setCameraOff(new Set(cameraOff).add(s.id));
    setFlash({ id: s.id, text: 'Bad Hair Day pass used: join with your camera off, no questions asked.', tone: 'ok' });
  }

  return (
    <>
      <section aria-label="Calendar" className="grid gap-5 pt-8">
        <div
          role="group"
          aria-label="Weekly credits"
          className="sticky top-[max(10px,env(safe-area-inset-top))] z-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-[22px] bg-surface py-2.5 pr-2.5 pl-4.5 shadow-lift ring-1 ring-line"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-3.5">
              <div className="flex flex-wrap gap-1.5" aria-hidden="true">
                {Array.from({ length: total }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'size-3.5 rounded-full shadow-[inset_0_0_0_2px_var(--sun)] transition-colors duration-200',
                      i < used && 'bg-sun',
                    )}
                  />
                ))}
              </div>
              <div>
                <div className="font-bold tabular-nums">
                  {left} of {total} credits left this week
                </div>
                <div className="text-sm text-muted">Credits reset Sunday night</div>
              </div>
            </div>
            <div className="border-line sm:border-l sm:pl-6">
              <div className="font-bold tabular-nums">Bad Hair Day pass: {passes} left</div>
              <div className="text-sm text-muted">{PASSES_PER_MONTH} a month</div>
            </div>
          </div>
          <Button onClick={() => setExtra(extra + 1)}>Add a credit · $4</Button>
        </div>

        <div
          role="tablist"
          aria-label="Day of the week"
          className="grid grid-cols-3 gap-1 rounded-[22px] bg-shell p-1 ring-1 ring-line md:grid-cols-6 md:rounded-full"
        >
          {DAYS.map((d) => {
            const n = booked.filter((id) => byId(id).day === d).length;
            return (
              <button
                key={d}
                role="tab"
                type="button"
                aria-selected={d === day}
                onClick={() => setDay(d)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-2.5 py-2 font-semibold transition-colors duration-200 ease-spring hover:bg-surface aria-selected:bg-fg aria-selected:text-bg"
              >
                {FULL[d]}
                {n > 0 && <span className="size-2 rounded-full bg-sun" title={`${n} booked`} />}
              </button>
            );
          })}
        </div>

        <div aria-live="polite" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-4">
          {SESSIONS.filter((s) => s.day === day).map((s) => (
            <SessionCard
              key={s.id}
              s={s}
              isBooked={booked.includes(s.id)}
              isCameraOff={cameraOff.has(s.id)}
              isConfirming={confirming === s.id}
              passes={passes + (cameraOff.has(s.id) ? 1 : 0)}
              flash={flash.id === s.id ? flash : null}
              onBook={() => book(s)}
              onCancel={() => cancel(s)}
              onCancelLate={(withPass) => cancelLate(s, withPass)}
              onKeep={() => setConfirming(null)}
              onCameraOff={() => goCameraOff(s)}
              canCameraOff={passes > 0}
            />
          ))}
        </div>
      </section>

      <Section id="reminders">
        <SectionHead eyebrow="Reminders" title="Reminders that do the nagging">
          <Lead>Choose how MeetDoConnect nudges you. Your booked sessions show the messages you would get.</Lead>
        </SectionHead>
        <div className="grid gap-4 lg:grid-cols-[5fr_7fr] lg:items-start">
          <Shell>
            <h3 className="text-xl">Your reminder settings</h3>
            <div className="grid">
              {PREFS.map(([key, label]) => (
                <label
                  key={key}
                  className="flex min-h-13 cursor-pointer items-center justify-between gap-3.5 border-b border-line font-medium"
                >
                  <input
                    type="checkbox"
                    checked={prefs[key]}
                    onChange={(e) => setPrefs({ ...prefs, [key]: e.target.checked })}
                    className="relative order-2 h-7 w-11.5 shrink-0 cursor-pointer appearance-none rounded-full bg-line-strong transition-colors duration-200 ease-spring after:absolute after:top-[3px] after:left-[3px] after:size-5.5 after:rounded-full after:bg-white after:shadow-[0_1px_3px_rgb(0_0_0/0.3)] after:transition-transform after:duration-200 after:ease-spring after:content-[''] checked:bg-accent checked:after:translate-x-4.5"
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-[0.88rem] text-warn">
              Prototype: nothing is sent. The live site would send an email with a calendar invite at booking, plus the
              messages you pick here.
            </p>
          </Shell>
          <Shell>
            <h3 className="text-xl">Your reminder schedule</h3>
            {schedule.length === 0 ? (
              <p className="text-muted">Book a session above and its reminders appear here.</p>
            ) : (
              <div className="grid">
                {schedule.map((s) => (
                  <div key={s.id} className="grid gap-1 border-t border-line py-3.5 first:border-t-0 first:pt-0">
                    <strong>
                      {FULL[s.day]} {s.time} · {s.title}
                    </strong>
                    <ul className="text-sm text-muted">
                      {reminders(s, prefs, cameraOff.has(s.id)).map((r) => (
                        <li key={r} className="my-0.5">
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {prefs.sunday && (
                  <div className="grid gap-1 border-t border-line pt-3.5">
                    <strong>Sunday 4:00 pm</strong>
                    <p className="text-sm text-muted">{left} credits left this week</p>
                  </div>
                )}
              </div>
            )}
          </Shell>
        </div>
      </Section>
    </>
  );
}

function SessionCard({
  s,
  isBooked,
  isCameraOff,
  isConfirming,
  passes,
  canCameraOff,
  flash,
  onBook,
  onCancel,
  onCancelLate,
  onKeep,
  onCameraOff,
}: {
  s: Session;
  isBooked: boolean;
  isCameraOff: boolean;
  isConfirming: boolean;
  /** Passes available if this booking is cancelled (a camera-off pass on it comes back). */
  passes: number;
  canCameraOff: boolean;
  flash: Flash | null;
  onBook: () => void;
  onCancel: () => void;
  onCancelLate: (withPass: boolean) => void;
  onKeep: () => void;
  onCameraOff: () => void;
}) {
  const seatsLeft = s.seats - s.taken - (isBooked ? 1 : 0);
  const isFull = seatsLeft <= 0 && !isBooked;
  const hours = Math.floor(hoursUntil(s));
  return (
    <article
      className={cn(
        'grid min-w-0 content-start gap-3 rounded-card bg-surface p-[clamp(20px,2.6vw,28px)] shadow-lift transition-shadow duration-200',
        isBooked ? 'ring-2 ring-accent' : 'ring-1 ring-line',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <span className="font-bold text-accent tabular-nums">
          {s.time} · {s.mins} min
        </span>
        <span className="flex flex-wrap gap-1.5">
          {isLate(s) && <span className={cn(TAG, 'bg-warn-bg text-warn')}>Starts in {hours} hours</span>}
          <span className={TAG}>{s.kind}</span>
          <span className={TAG}>{s.mode}</span>
        </span>
      </div>
      <h3 className="text-2xl">
        <Link href={activityHref(s.title)} className="text-fg no-underline hover:text-accent">
          {s.title}
        </Link>
      </h3>
      <p>{s.blurb}</p>
      <div className="flex flex-wrap justify-between gap-x-3.5 gap-y-1 text-sm text-muted">
        <span>For: {s.who}</span>
        <span>{isFull ? 'Full' : `${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} left`}</span>
      </div>
      <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-band">
        <i
          className="block h-full origin-left bg-sun transition-transform duration-400 ease-spring"
          style={{ transform: `scaleX(${1 - seatsLeft / s.seats})` }}
        />
      </div>

      {isConfirming ? (
        <div className="grid gap-2.5 rounded-xl bg-warn-bg p-3.5 text-[0.93rem] text-warn">
          <p>Less than 24 hours to go, so cancelling now uses the credit.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled={passes < 1} onClick={() => onCancelLate(true)}>
              Use Bad Hair Day pass
            </Button>
            <Button onClick={() => onCancelLate(false)}>Cancel and use the credit</Button>
            <Button variant="quiet" onClick={onKeep}>
              Keep my seat
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2.5">
          {isBooked ? (
            <>
              <Button onClick={onCancel}>Cancel booking</Button>
              {isCameraOff ? (
                <span className={cn(TAG, 'bg-accent-soft text-accent')}>Camera off · Bad Hair Day</span>
              ) : (
                <Button variant="quiet" disabled={!canCameraOff} onClick={onCameraOff}>
                  Bad Hair Day: camera off
                </Button>
              )}
            </>
          ) : (
            <Button variant="primary" disabled={isFull} onClick={onBook}>
              Book · 1 credit
            </Button>
          )}
          {flash && (
            <span role="status" className={cn('text-[0.88rem]', flash.tone === 'ok' ? 'text-accent' : 'text-warn')}>
              {flash.text}
            </span>
          )}
        </div>
      )}
      {isBooked && <PrepCard s={s} />}
    </article>
  );
}

export function RoomDemo() {
  const [secs, setSecs] = useState(300);
  const [prompt, setPrompt] = useState(0);
  const [roleMsg, setRoleMsg] = useState('');

  useEffect(() => {
    const id = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 300)), 1000);
    return () => clearInterval(id);
  }, []);

  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return (
    <Shell ink coreClassName="gap-4.5" aria-label="Example room">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <strong className="inline-flex items-center gap-2.5">
          <LiveDot />
          Mocktail Studio · Round 2 of 4
        </strong>
        <span className="rounded-full bg-surface px-3.5 py-1 font-display text-lg font-bold tabular-nums">
          Timer {mm}:{ss}
        </span>
      </div>
      <ul aria-label="People in the example room" className="flex flex-wrap gap-3.5">
        {FACES.map(([initials, name]) => (
          <li key={name} className="grid justify-items-center gap-1.5 text-[0.82rem] text-muted">
            <span className={AVATAR}>{initials}</span>
            {name}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {['Starter: Jo', 'Timekeeper: You', 'Closer: Priya'].map((role) => (
          <span key={role} className="rounded-full bg-surface px-3 py-1 text-[0.85rem] font-semibold">
            {role}
          </span>
        ))}
      </div>
      <p
        aria-live="polite"
        className="rounded-r-2xl border-l-4 border-sun bg-ink-2 px-5 py-4.5 font-display text-[clamp(1.25rem,2.4vw,1.6rem)] leading-tight font-semibold text-balance"
      >
        {PROMPTS[prompt]}
      </p>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="primary" onClick={() => setPrompt((prompt + 1) % PROMPTS.length)}>
          Next prompt
        </Button>
        <Button onClick={() => setRoleMsg('Timekeeper passed to Marcus.')}>Pass my role</Button>
        <span role="status" className="text-[0.88rem] text-warn">
          {roleMsg}
        </span>
      </div>
    </Shell>
  );
}

export function BuddyPick() {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const toggle = (name: string) => {
    const next = new Set(picked);
    if (!next.delete(name)) next.add(name);
    setPicked(next);
  };
  return (
    <Shell>
      <h3 className="text-xl">Try it: Mocktail Studio, Friday (example room)</h3>
      <p>Who would you do this again with?</p>
      <div className="flex flex-wrap gap-2.5">
        {PICKS.map((p) => (
          <button
            key={p.name}
            type="button"
            aria-pressed={picked.has(p.name)}
            onClick={() => toggle(p.name)}
            className="inline-flex min-h-13 items-center gap-2.5 rounded-full bg-bg py-1.5 pr-4.5 pl-1.5 font-semibold ring-1 ring-line transition duration-200 ease-spring hover:ring-[1.5px] hover:ring-accent active:scale-97 aria-pressed:bg-accent-soft aria-pressed:ring-2 aria-pressed:ring-accent"
          >
            <span className={cn(AVATAR, 'size-9.5 text-[0.85rem]')}>{p.name.slice(0, 2)}</span>
            {p.name}
          </button>
        ))}
      </div>
      <div aria-live="polite" className="grid gap-2">
        {PICKS.filter((p) => picked.has(p.name)).map((p) =>
          p.pickedYou ? (
            <div key={p.name} className="rounded-xl bg-accent-soft px-3.5 py-3 text-[0.93rem] font-semibold">
              It is a match with {p.name}. A private buddy chat opens, with a session you can both book.
            </div>
          ) : (
            <div key={p.name} className="rounded-xl bg-bg px-3.5 py-3 text-[0.93rem]">
              Your pick of {p.name} is private. You only hear back if {p.name} picks you too.
            </div>
          ),
        )}
      </div>
      <p className="text-sm text-muted">
        In this demo, Priya and Jo have already picked you. Marcus and Dana have not.
      </p>
    </Shell>
  );
}

export function ReportDemo() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [sent, setSent] = useState('');
  return (
    <Shell className="lg:sticky lg:top-6">
      <h3 className="text-xl">Try the one-tap report</h3>
      <p className="text-muted">Report, mute and leave stay on screen in every room.</p>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button
          aria-expanded={open}
          onClick={() => {
            setOpen(true);
            setSent('');
          }}
        >
          Report
        </Button>
        <Button disabled>Mute</Button>
        <Button disabled>Leave</Button>
      </div>
      {open && (
        <div className="grid gap-2">
          <label htmlFor="reason" className="font-semibold">
            What happened?
          </label>
          <select
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-11 max-w-full rounded-xl border border-line-strong bg-surface px-3 py-2"
          >
            {REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="primary"
              onClick={() => {
                setOpen(false);
                setSent(reason);
              }}
            >
              Send report
            </Button>
            <Button variant="quiet" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {sent && (
        <div role="status" className="rounded-xl bg-bg px-3.5 py-3 text-[0.93rem]">
          Report sent: {sent}. The person is removed from the room now and the account is flagged. Two reports from
          different members within 30 days suspends it until reviewed.
        </div>
      )}
    </Shell>
  );
}

export function JoinButton() {
  const [clicked, setClicked] = useState(false);
  return (
    <>
      <Button variant="primary" size="lg" onClick={() => setClicked(true)} className="justify-self-stretch">
        Join and pick your first evening
      </Button>
      {clicked && (
        <p role="status" className="text-[0.88rem] text-warn">
          Prototype: this button does not take payments yet.
        </p>
      )}
    </>
  );
}
