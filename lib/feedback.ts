// The survey after each session (schema section 39; Kelly's questions 3, 5, 6, 7 and comments, 10 Nov). The
// session and the member come from the page and the sign-in; the device comes from the browser. Checked by
// scripts/test-feedback.ts.
import type { SupabaseClient } from '@supabase/supabase-js';

export type Device = 'android_app' | 'apple_app' | 'website';
export type Av = 'yes' | 'mostly' | 'no';

export interface Answers {
  join_ease: number | null;
  av: Av | null;
  av_note: string;
  roles: number | null;
  comfort: number | null;
  comfort_note: string;
  confusing: string;
}

export const EMPTY_ANSWERS: Answers = {
  join_ease: null,
  av: null,
  av_note: '',
  roles: null,
  comfort: null,
  comfort_note: '',
  confusing: '',
};

export const NOTE_MAX = 600;
export const COMMENT_MAX = 1000;

export const DEVICE_LABEL: Record<Device, string> = {
  android_app: 'Android app',
  apple_app: 'Apple app',
  website: 'Website',
};

export const AV_LABEL: Record<Av, string> = { yes: 'Yes', mostly: 'Mostly', no: 'No' };

/** The installed app runs on its own (home-screen app); the user agent tells Android from Apple. */
export function detectDevice(userAgent: string, standalone: boolean): Device {
  if (!standalone) return 'website';
  if (/Android/i.test(userAgent)) return 'android_app';
  if (/iPhone|iPad|iPod|Macintosh/i.test(userAgent)) return 'apple_app';
  return 'website';
}

export function browserDevice(): Device {
  const standalone =
    matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  return detectDevice(navigator.userAgent, standalone);
}

/** "If not, what happened?" shows for Mostly and No; "Anything that made you less comfortable?" below 5. */
export const showAvNote = (a: Answers): boolean => a.av === 'mostly' || a.av === 'no';
export const showComfortNote = (a: Answers): boolean => a.comfort !== null && a.comfort < 5;

const isRating = (n: number | null): n is number => n !== null && Number.isInteger(n) && n >= 1 && n <= 5;
const text = (s: string): string | null => s.trim() || null;

export type Payload = {
  session_id: string;
  device: Device;
  join_ease: number;
  av: Av;
  av_note: string | null;
  roles: number;
  comfort: number;
  comfort_note: string | null;
  confusing: string | null;
};

/** What goes to submit_session_feedback, or the message to show. A box that is hidden sends nothing. */
export function feedbackPayload(
  sessionId: string,
  device: Device,
  a: Answers,
): { ok: true; payload: Payload } | { ok: false; error: string } {
  if (!isRating(a.join_ease) || !a.av || !isRating(a.roles) || !isRating(a.comfort)) {
    return { ok: false, error: 'Please answer the four questions. The boxes are optional.' };
  }
  const tooLong =
    (showAvNote(a) && a.av_note.trim().length > NOTE_MAX) ||
    (showComfortNote(a) && a.comfort_note.trim().length > NOTE_MAX) ||
    a.confusing.trim().length > COMMENT_MAX;
  if (tooLong) return { ok: false, error: 'One of the answers is too long. Please shorten it.' };
  return {
    ok: true,
    payload: {
      session_id: sessionId,
      device,
      join_ease: a.join_ease,
      av: a.av,
      av_note: showAvNote(a) ? text(a.av_note) : null,
      roles: a.roles,
      comfort: a.comfort,
      comfort_note: showComfortNote(a) ? text(a.comfort_note) : null,
      confusing: text(a.confusing),
    },
  };
}

export interface FeedbackStatus {
  ask: boolean;
  sent: boolean;
}

/**
 * Whether /after-session shows the questions. If the call fails (for example before the section 39 SQL is run),
 * the page goes straight to the buddy picks, which matter more than the survey.
 */
export async function getFeedbackStatus(supabase: SupabaseClient, sessionId: string): Promise<FeedbackStatus> {
  const { data, error } = await supabase.rpc('feedback_status', { p_session: sessionId });
  if (error || !data) return { ask: false, sent: false };
  const res = data as Partial<FeedbackStatus>;
  return { ask: res.ask === true, sent: res.sent === true };
}

export async function sendFeedback(supabase: SupabaseClient, payload: Payload): Promise<{ error: string }> {
  const { data, error } = await supabase.rpc('submit_session_feedback', { p: payload });
  if (error) return { error: 'Your answers could not be sent. Please try again.' };
  const res = (data ?? {}) as { success?: boolean; error?: string };
  return res.success ? { error: '' } : { error: res.error ?? 'Your answers could not be sent.' };
}

/** Skip is remembered for this browser tab, so a refresh doesn't ask again. */
const skipKey = (sessionId: string) => `mdc-feedback-skip:${sessionId}`;
export function skippedFeedback(sessionId: string): boolean {
  try {
    return sessionStorage.getItem(skipKey(sessionId)) === '1';
  } catch {
    return false;
  }
}
export function rememberSkip(sessionId: string): void {
  try {
    sessionStorage.setItem(skipKey(sessionId), '1');
  } catch {
    // Private mode without storage: the questions show again on refresh, which is harmless.
  }
}

/** One answer as Admin > Feedback reads it (session_feedback with the member and the session). */
export interface FeedbackRow {
  id: string;
  device: Device;
  join_ease: number;
  av: Av;
  av_note: string | null;
  roles: number;
  comfort: number;
  comfort_note: string | null;
  confusing: string | null;
  created_at: string;
  updated_at: string;
  profiles: { first_name: string | null; last_name: string | null; email: string | null } | null;
  sessions: { title: string; starts_at: string } | null;
}

export const FEEDBACK_COLUMNS =
  'id,device,join_ease,av,av_note,roles,comfort,comfort_note,confusing,created_at,updated_at,' +
  'profiles(first_name,last_name,email),sessions(title,starts_at)';

export const CSV_HEADER = [
  'Sent',
  'Member',
  'Email',
  'Session',
  'Session date',
  'Used',
  'How easy was it to join? (1-5)',
  'Did video and audio work well?',
  'If not, what happened?',
  'Roles and prompts kept the room on track (1-5)',
  'How comfortable did you feel? (1-5)',
  'What made you less comfortable?',
  'What was confusing or frustrating?',
] as const;

/**
 * Members type the comments, and the file opens in Excel or Google Sheets, so a cell that starts like a formula
 * (= + - @) gets a leading apostrophe and is shown as text.
 */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV for Excel and Google Sheets: UTF-8 with a BOM (so Excel keeps accents), one answer per row. */
export function feedbackCsv(rows: FeedbackRow[], when: (iso: string) => string): string {
  const name = (p: FeedbackRow['profiles']) => `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim();
  const lines = rows.map((r) =>
    [
      when(r.updated_at),
      name(r.profiles),
      r.profiles?.email,
      r.sessions?.title,
      r.sessions ? when(r.sessions.starts_at) : '',
      DEVICE_LABEL[r.device],
      r.join_ease,
      AV_LABEL[r.av],
      r.av_note,
      r.roles,
      r.comfort,
      r.comfort_note,
      r.confusing,
    ]
      .map(csvCell)
      .join(','),
  );
  return `﻿${[CSV_HEADER.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`;
}
