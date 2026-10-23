'use client';

// The interactive prototypes on the home page. Nothing here is saved, sent or charged.
import { useEffect, useState } from 'react';
import { ALLDAYS, DAYS, FULL, IDX, SESSIONS } from './sessions';

const BASE_CREDITS = 3;
const PREFS = [
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
];
const FACES = [['Pr', 'Priya'], ['Ma', 'Marcus'], ['Jo', 'Jo'], ['Da', 'Dana'], ['You', 'You']];
const PICKS = [{ n: 'Priya', you: true }, { n: 'Marcus', you: false }, { n: 'Jo', you: true }, { n: 'Dana', you: false }];
const REASONS = ['Nudity or sexual content', 'Harassment or rudeness', 'Selling or spam', 'Something else'];
const NO_FLASH = { id: null, text: '' };

const byId = (id) => SESSIONS.find((s) => s.id === id);
const oneHourBefore = (time) => (time === '6:30 pm' ? '5:30 pm' : '7:00 pm');
const dayBack = (day, n) => ALLDAYS[(((IDX[day] - n) % 7) + 7) % 7];

function prepText(s) {
  return `${s.title} prep card (${s.cost})\n\nSupplies:\n- ${s.supplies.join('\n- ')}\n\nRun of show:\n- ${s.run.join('\n- ')}${s.safety ? `\n\n${s.safety}` : ''}`;
}

function reminders(s, prefs) {
  const items = ['At booking: confirmation email with calendar invite'];
  if (prefs.prep) items.push(`Prep card ready: ${dayBack(s.day, 2)} ${s.time}`);
  if (prefs.e24) items.push(`Email reminder: ${dayBack(s.day, 1)} ${s.time}`);
  if (prefs.e1) items.push(`Email with join link: ${FULL[s.day]} ${oneHourBefore(s.time)}`);
  if (prefs.text) items.push(`Text with join link: ${FULL[s.day]} ${oneHourBefore(s.time)}`);
  items.push('After the session: who would you do this again with?');
  return items;
}

function CopyButton({ text }) {
  const [label, setLabel] = useState('Copy card text');
  const done = (m) => {
    setLabel(m);
    setTimeout(() => setLabel('Copy card text'), 1800);
  };
  const copy = () => {
    try {
      navigator.clipboard.writeText(text).then(() => done('Copied'), () => done('Select the card text to copy'));
    } catch {
      done('Select the card text to copy');
    }
  };
  return <button className="btn quiet" type="button" onClick={copy}>{label}</button>;
}

function PrepCard({ s }) {
  return (
    <details className="prep">
      <summary>Prep card · {s.cost}</summary>
      <div className="prep-body">
        <div><h4>Supplies</h4><ul>{s.supplies.map((x) => <li key={x}>{x}</li>)}</ul></div>
        <div><h4>Run of show</h4><ol>{s.run.map((x) => <li key={x}>{x}</li>)}</ol></div>
        {s.safety && <p className="msg">{s.safety}</p>}
        <div className="actions"><CopyButton text={prepText(s)} /></div>
      </div>
    </details>
  );
}

// Calendar, credits and the reminder schedule share the bookings, so they live together.
export function Planner() {
  const [day, setDay] = useState('Fri');
  const [booked, setBooked] = useState([]);
  const [extra, setExtra] = useState(0);
  const [flash, setFlash] = useState(NO_FLASH);
  const [prefs, setPrefs] = useState({ prep: true, e24: true, e1: true, text: false, sunday: true });

  const total = BASE_CREDITS + extra;
  const left = total - booked.length;
  const schedule = booked.map(byId).sort((x, y) => IDX[x.day] - IDX[y.day] || (x.time < y.time ? -1 : 1));

  function book(s) {
    const clash = booked.some((id) => byId(id).day === s.day && byId(id).time === s.time);
    if (clash) setFlash({ id: s.id, text: 'You already have a session at this time. Cancel it to switch.' });
    else if (left <= 0) setFlash({ id: s.id, text: 'No credits left. Add a credit for $4 or cancel another booking.' });
    else {
      setBooked([...booked, s.id]);
      setFlash(NO_FLASH);
    }
  }
  function cancel(id) {
    setBooked(booked.filter((b) => b !== id));
    setFlash(NO_FLASH);
  }

  return (
    <>
      <section id="evenings" className="section">
        <div className="section-head">
          <span className="eyebrow">Prototype calendar</span>
          <h2>This week&apos;s evenings</h2>
          <p className="note">Example seats and times (Central). Bookings are not saved and nothing is sent or charged.</p>
        </div>

        <div className="credits" role="group" aria-label="Weekly credits">
          <div className="credits-left">
            <div className="pips" aria-hidden="true">
              {Array.from({ length: total }, (_, i) => <span key={i} className={i < booked.length ? 'pip used' : 'pip'} />)}
            </div>
            <div>
              <div className="credit-text">{left} of {total} credits left this week</div>
              <div className="muted small">Credits reset Sunday night</div>
            </div>
          </div>
          <button className="btn" type="button" onClick={() => setExtra(extra + 1)}>Add a credit · $4</button>
        </div>

        <div className="tabs" role="tablist" aria-label="Day of the week">
          {DAYS.map((d) => {
            const n = booked.filter((id) => byId(id).day === d).length;
            return (
              <button key={d} className="tab" role="tab" type="button" aria-selected={d === day} onClick={() => setDay(d)}>
                {FULL[d]}
                {n > 0 && <span className="dot" title={`${n} booked`} />}
              </button>
            );
          })}
        </div>

        <div className="sessions" aria-live="polite">
          {SESSIONS.filter((s) => s.day === day).map((s) => {
            const isBooked = booked.includes(s.id);
            const seatsLeft = s.seats - s.taken - (isBooked ? 1 : 0);
            const full = seatsLeft <= 0 && !isBooked;
            return (
              <article key={s.id} className={isBooked ? 'session booked' : 'session'}>
                <div className="s-head">
                  <span className="time">{s.time} · {s.mins} min</span>
                  <span className="tags"><span className="tag">{s.kind}</span><span className="tag">{s.mode}</span></span>
                </div>
                <h3>{s.title}</h3>
                <p>{s.blurb}</p>
                <div className="meta">
                  <span>For: {s.who}</span>
                  <span>{full ? 'Full' : `${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} left`}</span>
                </div>
                <div className="seats" aria-hidden="true"><i style={{ transform: `scaleX(${1 - seatsLeft / s.seats})` }} /></div>
                <div className="actions">
                  {isBooked
                    ? <button className="btn" type="button" onClick={() => cancel(s.id)}>Cancel booking</button>
                    : <button className="btn primary" type="button" disabled={full} onClick={() => book(s)}>Book · 1 credit</button>}
                  {flash.id === s.id && <span className="msg">{flash.text}</span>}
                </div>
                {isBooked && <PrepCard s={s} />}
              </article>
            );
          })}
        </div>
      </section>

      <section id="reminders" className="section">
        <div className="section-head">
          <span className="eyebrow">Reminders</span>
          <h2>Reminders that do the nagging</h2>
          <p className="lead">Choose how MeetDoConnect nudges you. Your booked sessions show the messages you would get.</p>
        </div>
        <div className="reminders">
          <div className="shell">
            <div className="core">
              <h3>Your reminder settings</h3>
              <div className="toggles">
                {PREFS.map(([key, label]) => (
                  <label key={key} className="toggle">
                    <input type="checkbox" role="switch" checked={prefs[key]} onChange={(e) => setPrefs({ ...prefs, [key]: e.target.checked })} />
                    {label}
                  </label>
                ))}
              </div>
              <p className="msg">Prototype: nothing is sent. The live site would send an email with a calendar invite at booking, plus the messages you pick here.</p>
            </div>
          </div>
          <div className="shell">
            <div className="core">
              <h3>Your reminder schedule</h3>
              {schedule.length === 0 ? (
                <p className="muted">Book a session above and its reminders appear here.</p>
              ) : (
                <div className="rem-list">
                  {schedule.map((s) => (
                    <div key={s.id} className="rem-row">
                      <strong>{FULL[s.day]} {s.time} · {s.title}</strong>
                      <ul>{reminders(s, prefs).map((r) => <li key={r}>{r}</li>)}</ul>
                    </div>
                  ))}
                  {prefs.sunday && (
                    <div className="rem-row"><strong>Sunday 4:00 pm</strong><ul><li>{left} credits left this week</li></ul></div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
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
    <div className="shell">
      <div className="core ink room" role="group" aria-label="Example room">
        <div className="room-top">
          <strong><span className="live" aria-hidden="true" />Mocktail Studio · Round 2 of 4</strong>
          <span className="timer">Timer {mm}:{ss}</span>
        </div>
        <ul className="faces" aria-label="People in the example room">
          {FACES.map(([initials, name]) => <li key={name} className="face"><span className="avatar">{initials}</span>{name}</li>)}
        </ul>
        <div className="roles"><span className="role">Starter: Jo</span><span className="role">Timekeeper: You</span><span className="role">Closer: Priya</span></div>
        <p className="prompt" aria-live="polite">{PROMPTS[prompt]}</p>
        <div className="actions">
          <button className="btn primary" type="button" onClick={() => setPrompt((prompt + 1) % PROMPTS.length)}>Next prompt</button>
          <button className="btn" type="button" onClick={() => setRoleMsg('Timekeeper passed to Marcus.')}>Pass my role</button>
          <span className="msg" role="status">{roleMsg}</span>
        </div>
      </div>
    </div>
  );
}

export function BuddyPick() {
  const [picked, setPicked] = useState({});
  return (
    <div className="shell">
      <div className="core">
        <h3>Try it: Mocktail Studio, Friday (example room)</h3>
        <p>Who would you do this again with?</p>
        <div className="pick">
          {PICKS.map((p) => (
            <button key={p.n} type="button" aria-pressed={!!picked[p.n]} onClick={() => setPicked({ ...picked, [p.n]: !picked[p.n] })}>
              <span className="avatar sm">{p.n.slice(0, 2)}</span>
              {p.n}
            </button>
          ))}
        </div>
        <div className="results" aria-live="polite">
          {PICKS.filter((p) => picked[p.n]).map((p) => (p.you
            ? <div key={p.n} className="result match">It is a match with {p.n}. A private buddy chat opens, with a session you can both book.</div>
            : <div key={p.n} className="result">Your pick of {p.n} is private. You only hear back if {p.n} picks you too.</div>))}
        </div>
        <p className="muted small">In this demo, Priya and Jo have already picked you. Marcus and Dana have not.</p>
      </div>
    </div>
  );
}

export function ReportDemo() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [sent, setSent] = useState('');
  return (
    <div className="shell report-shell">
      <div className="core">
        <h3>Try the one-tap report</h3>
        <p className="muted">Report, mute and leave stay on screen in every room.</p>
        <div className="actions">
          <button className="btn" type="button" aria-expanded={open} onClick={() => { setOpen(true); setSent(''); }}>Report</button>
          <button className="btn" type="button" disabled>Mute</button>
          <button className="btn" type="button" disabled>Leave</button>
        </div>
        {open && (
          <div className="report-panel">
            <label htmlFor="reason">What happened?</label>
            <select id="reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => <option key={r}>{r}</option>)}
            </select>
            <div className="actions">
              <button className="btn primary" type="button" onClick={() => { setOpen(false); setSent(reason); }}>Send report</button>
              <button className="btn quiet" type="button" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </div>
        )}
        {sent && (
          <div className="result" role="status">
            Report sent: {sent}. The person is removed from the room now and the account is flagged. Two reports from different members within 30 days suspends it until reviewed.
          </div>
        )}
      </div>
    </div>
  );
}

export function JoinButton() {
  const [clicked, setClicked] = useState(false);
  return (
    <>
      <button className="btn primary big" type="button" onClick={() => setClicked(true)}>Join and pick your first evening</button>
      {clicked && <p className="msg" role="status">Prototype: this button does not take payments yet.</p>}
    </>
  );
}
