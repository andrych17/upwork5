'use client';

// The survey after a session (schema section 39, Kelly's questions 3, 5, 6, 7 and comments). /after-session shows
// it before the buddy picks while feedback_status() says to ask; Send or Skip moves on to the picks.
import type { SupabaseClient } from '@supabase/supabase-js';
import { useState, type FormEvent, type ReactNode } from 'react';
import {
  browserDevice,
  COMMENT_MAX,
  EMPTY_ANSWERS,
  feedbackPayload,
  NOTE_MAX,
  sendFeedback,
  showAvNote,
  showComfortNote,
  type Answers,
  type Av,
} from '@/lib/feedback';

interface Props {
  supabase: SupabaseClient;
  session: { id: string; title: string };
  onDone: (result: 'sent' | 'skipped') => void;
}

const SCALE = [1, 2, 3, 4, 5];
const AV_OPTIONS: { value: Av; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'mostly', label: 'Mostly' },
  { value: 'no', label: 'No' },
];

export default function SessionFeedback({ supabase, session, onDone }: Props) {
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = <K extends keyof Answers>(key: K, value: Answers[K]) => {
    setAnswers((current) => ({ ...current, [key]: value }));
    setError('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const checked = feedbackPayload(session.id, browserDevice(), answers);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setBusy(true);
    const res = await sendFeedback(supabase, checked.payload);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onDone('sent');
  };

  return (
    <>
      <section className="after-hero">
        <p className="section-label">{session.title} complete</p>
        <h1>
          How did
          <br />
          it <span>go?</span>
        </h1>
        <p>
          Four quick taps and one optional box. Your answers go to the MeetDoConnect team with your name and this
          session. Nobody in the room sees them. Then you can pick buddies.
        </p>
      </section>

      <form className="fb-form" onSubmit={(e) => void submit(e)} noValidate>
        <Rating
          n={1}
          name="join_ease"
          question="How easy was it to join?"
          low="Hard"
          high="Very easy"
          value={answers.join_ease}
          onChange={(v) => set('join_ease', v)}
        />

        <fieldset className="fb-q">
          <legend>
            <span className="fb-num">2</span>Did video and audio work well?
          </legend>
          <div className="fb-scale fb-choice">
            {AV_OPTIONS.map((o) => (
              <label className="fb-opt" key={o.value}>
                <input
                  className="sr-only"
                  type="radio"
                  name="av"
                  value={o.value}
                  checked={answers.av === o.value}
                  onChange={() => set('av', o.value)}
                />
                {o.label}
              </label>
            ))}
          </div>
          {showAvNote(answers) && (
            <Note
              label="If not, what happened? (optional)"
              value={answers.av_note}
              max={NOTE_MAX}
              onChange={(v) => set('av_note', v)}
            />
          )}
        </fieldset>

        <Rating
          n={3}
          name="roles"
          question="How well did the Starter, Timekeeper and Closer roles and prompts keep the room on track without anyone in charge?"
          low="Not well"
          high="Very well"
          value={answers.roles}
          onChange={(v) => set('roles', v)}
        />

        <Rating
          n={4}
          name="comfort"
          question="How comfortable did you feel in the room?"
          low="Not at all"
          high="Very comfortable"
          value={answers.comfort}
          onChange={(v) => set('comfort', v)}
        >
          {showComfortNote(answers) && (
            <Note
              label="Anything that made you less comfortable? (optional)"
              value={answers.comfort_note}
              max={NOTE_MAX}
              onChange={(v) => set('comfort_note', v)}
            />
          )}
        </Rating>

        <div className="fb-q">
          <Note
            label="What was confusing or frustrating? (optional)"
            value={answers.confusing}
            max={COMMENT_MAX}
            rows={3}
            onChange={(v) => set('confusing', v)}
          />
        </div>

        {error && (
          <p className="buddy-error" role="alert">
            {error}
          </p>
        )}
        <div className="picker-actions">
          <button className="save-picks" type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send feedback'} <span aria-hidden="true">→</span>
          </button>
          <button type="button" className="link-button" disabled={busy} onClick={() => onDone('skipped')}>
            Skip
          </button>
        </div>
      </form>
    </>
  );
}

function Rating({
  n,
  name,
  question,
  low,
  high,
  value,
  onChange,
  children,
}: {
  n: number;
  name: string;
  question: string;
  low: string;
  high: string;
  value: number | null;
  onChange: (value: number) => void;
  children?: ReactNode;
}) {
  return (
    <fieldset className="fb-q">
      <legend>
        <span className="fb-num">{n}</span>
        {question}
      </legend>
      <div className="fb-scale">
        {SCALE.map((v) => (
          <label className="fb-opt" key={v}>
            <input
              className="sr-only"
              type="radio"
              name={name}
              value={v}
              checked={value === v}
              aria-label={v === 1 ? `1, ${low}` : v === 5 ? `5, ${high}` : undefined}
              onChange={() => onChange(v)}
            />
            {v}
          </label>
        ))}
      </div>
      <p className="fb-ends" aria-hidden="true">
        <span>1 · {low}</span>
        <span>5 · {high}</span>
      </p>
      {children}
    </fieldset>
  );
}

function Note({
  label,
  value,
  max,
  rows = 2,
  onChange,
}: {
  label: string;
  value: string;
  max: number;
  rows?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="fb-note">
      <span>{label}</span>
      <textarea rows={rows} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
