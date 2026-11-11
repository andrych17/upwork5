'use client';

// /testers: the sign-up form for the test week (Kelly 10 Nov). Visitors don't need an account. tester_join()
// (schema section 37) checks everything again, closes the form at the limit, and the free-week code email goes
// out from send-reminders: right away, or once Kelly taps Send code in Admin > Testers.
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { prepCards } from '@/lib/session-data';
import { getSupabase } from '@/lib/supabase';
import { testDay, TIME_ZONES, TIMES } from '@/lib/testers';

interface FormInfo {
  open: boolean;
  spots_left: number;
  limit: number;
  starts: string;
  ends: string;
  auto: boolean;
}

const AGREEMENTS = ['agree_dates', 'agree_camera', 'agree_feedback', 'agree_reward'] as const;
type Agreement = (typeof AGREEMENTS)[number];

const SESSION_TYPES = prepCards.map((card) => card.title);

function guessZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return TIME_ZONES.some(([id]) => id === zone) ? zone : '';
  } catch {
    return '';
  }
}

function Chips({
  options,
  selected,
  onToggle,
  label,
}: {
  options: readonly (readonly [string, string])[];
  selected: string[];
  onToggle: (key: string) => void;
  label: string;
}) {
  return (
    <div className="interest-grid" role="group" aria-label={label}>
      {options.map(([key, text]) => {
        const on = selected.includes(key);
        return (
          <button
            className={on ? 'selected' : ''}
            type="button"
            aria-pressed={on}
            key={key}
            onClick={() => onToggle(key)}
          >
            {text}
            <span aria-hidden="true">{on ? '✓' : '+'}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function TestersPage() {
  const [info, setInfo] = useState<FormInfo | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [zone, setZone] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [times, setTimes] = useState<string[]>([]);
  const [heard, setHeard] = useState('');
  const [note, setNote] = useState('');
  const [website, setWebsite] = useState('');
  const [agreed, setAgreed] = useState<Record<Agreement, boolean>>({
    agree_dates: false,
    agree_camera: false,
    agree_feedback: false,
    agree_reward: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ name: string; auto: boolean } | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    let live = true;
    // The visitor's own time zone is only known in the browser, so it is picked once the form info arrives.
    void Promise.resolve(supabase?.rpc('tester_form_info') ?? null).then((res) => {
      if (!live) return;
      setZone((current) => current || guessZone());
      if (!res || res.error || !res.data) setLoadError(true);
      else setInfo(res.data as FormInfo);
    });
    return () => {
      live = false;
    };
  }, []);

  const toggle = (set: typeof setInterests) => (key: string) =>
    set((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));

  const missing = (): string => {
    if (!firstName.trim()) return 'Please enter your first name.';
    if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email.trim())) return 'Please enter a valid email address.';
    if (!zone) return 'Please choose your time zone.';
    if (!interests.length) return 'Please choose at least one session type.';
    if (!times.length) return 'Please choose at least one time you could attend.';
    if (!heard.trim()) return 'Please tell us how you heard about us.';
    if (!AGREEMENTS.every((key) => agreed[key])) return 'Please tick all four boxes to join the test.';
    return '';
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = missing();
    if (problem) return setError(problem);
    const supabase = getSupabase();
    if (!supabase) return setError('The form is not connected yet. Please try again later.');
    setBusy(true);
    setError('');
    const { data, error: rpcError } = await supabase.rpc('tester_join', {
      p: { first_name: firstName, email, time_zone: zone, interests, times, heard, note, website, ...agreed },
    });
    setBusy(false);
    const res = (data ?? {}) as {
      success?: boolean;
      error?: string;
      first_name?: string;
      auto?: boolean;
      full?: boolean;
    };
    if (rpcError || res.success !== true) {
      if (res.full && info) setInfo({ ...info, spots_left: 0 });
      return setError(res.error ?? 'Something went wrong. Please try again.');
    }
    setDone({ name: res.first_name ?? firstName.trim(), auto: Boolean(res.auto) });
    window.scrollTo({ top: 0 });
  };

  const week = info ? `${testDay(info.starts)} to ${testDay(info.ends)}` : 'the test week';
  const closed = info && (!info.open || info.spots_left <= 0);

  return (
    <main className="signup-page testers-page">
      <header className="signup-header">
        <Link className="schedule-mark" href="/" aria-label="MeetDoConnect home">
          <span>Meet</span>
          <span>Do</span>
          <span>Connect</span>
        </Link>
        <Link href="/">What is MeetDoConnect?</Link>
      </header>

      <div className="signup-shell">
        <aside className="signup-aside">
          <p className="section-label">Free test week</p>
          <h1>Test MeetDoConnect and play free for 7 days!</h1>
          <p>
            MeetDoConnect is a membership site for live, small-group video sessions where you do something together:
            Share music, Play Trivia, Tell Dad Jokes, Quiet Co-Work. Stay-at-home nights can still be time to connect
            with others, one hour at a time. We’re looking for {info?.limit ?? 50} testers for one free week, no payment
            required, <strong>{week}</strong>.
          </p>
          <p>
            <strong>What you do:</strong> Attend 3 to 4 sessions that week and share quick feedback after each one.
          </p>
          <p>
            <strong>What you get:</strong> A free week of sessions, and a second free week when we open. The second
            reward is for testers who complete the testing.
          </p>
        </aside>

        <section className="signup-card">
          {done ? (
            <div className="signup-step" role="status">
              <p className="step-count">You’re on the list</p>
              <h2>Thanks, {done.name}!</h2>
              <p className="step-intro">
                {done.auto
                  ? 'Your free-week code is on its way to your email. Check your spam folder if you don’t see it in a few minutes.'
                  : 'You’re on the list. We’ll email your free-week code within one business day. Check your spam folder if you don’t see it.'}{' '}
                Spots are limited to {info?.limit ?? 50} testers.
              </p>
            </div>
          ) : loadError ? (
            <div className="signup-step">
              <p className="step-intro">The form didn’t load. Please refresh the page to try again.</p>
            </div>
          ) : !info ? (
            <div className="signup-step">
              <p className="step-intro">Loading…</p>
            </div>
          ) : closed ? (
            <div className="signup-step">
              <p className="step-count">Sign-ups closed</p>
              <h2>{info.open ? 'Every spot is taken.' : 'Sign-ups are closed.'}</h2>
              <p className="step-intro">
                Thank you for your interest. All {info.limit} tester spots are filled. We open for everyone soon.
              </p>
            </div>
          ) : (
            <form className="signup-step" onSubmit={(e) => void submit(e)} noValidate>
              <p className="step-count">
                {info.spots_left} of {info.limit} spots left
              </p>
              <h2>Join the test</h2>
              <div className="form-grid testers-grid">
                <label>
                  <span>1. First name</span>
                  <input
                    type="text"
                    autoComplete="given-name"
                    maxLength={40}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </label>
                <label>
                  <span>2. Email</span>
                  <input
                    type="email"
                    autoComplete="email"
                    maxLength={120}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label className="full-field">
                  <span>3. Time zone</span>
                  <select value={zone} onChange={(e) => setZone(e.target.value)}>
                    <option value="">Choose your time zone</option>
                    {TIME_ZONES.map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className="full-field">
                  <legend>4. Which session types interest you most?</legend>
                  <Chips
                    label="Session types"
                    options={SESSION_TYPES.map((title) => [title, title] as const)}
                    selected={interests}
                    onToggle={toggle(setInterests)}
                  />
                </fieldset>
                <fieldset className="full-field">
                  <legend>5. Which times could you attend?</legend>
                  <Chips label="Times" options={TIMES} selected={times} onToggle={toggle(setTimes)} />
                </fieldset>
                <label className="full-field">
                  <span>6. How did you hear about us?</span>
                  <input type="text" maxLength={200} value={heard} onChange={(e) => setHeard(e.target.value)} />
                </label>
                <label className="full-field">
                  <span>7. Anything we should know to make the test work for you? (optional)</span>
                  <textarea rows={3} maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
                {/* Left empty by people; bots that fill every box are ignored by tester_join(). */}
                <label className="testers-trap" aria-hidden="true">
                  <span>Website</span>
                  <input
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </label>
              </div>

              {(
                [
                  [
                    'agree_dates',
                    <>
                      I can attend 3 to 4 sessions during <strong>{week}</strong>.
                    </>,
                  ],
                  ['agree_camera', 'I will keep my camera on, except when using a Bad Hair Day card.'],
                  ['agree_feedback', 'I will complete a short feedback form after each session.'],
                  [
                    'agree_reward',
                    'I understand the second free week is for testers who complete the testing, and that my comments may be used to improve the site.',
                  ],
                ] as const
              ).map(([key, text]) => (
                <label className="check-row" key={key}>
                  <input
                    type="checkbox"
                    checked={agreed[key]}
                    onChange={(e) => setAgreed((current) => ({ ...current, [key]: e.target.checked }))}
                  />
                  <span>{text}</span>
                </label>
              ))}

              {error && (
                <div className="signup-alert error" role="alert">
                  {error}
                </div>
              )}
              <div className="signup-actions testers-actions">
                <button className="signup-next" type="submit" disabled={busy}>
                  {busy ? 'Sending…' : 'Join the test'}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
