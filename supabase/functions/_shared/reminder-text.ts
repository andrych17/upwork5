// Words for the 24-hour and 1-hour reminders: app notification, email and SMS.
// Pure functions with no Deno or Node globals, so `node supabase/functions/_tests/reminder-text.test.ts` can check them.

export type ReminderKind = '24h' | '1h';

export interface ReminderItem {
  booking_id: string;
  kind: ReminderKind;
  first_name: string | null;
  title: string;
  prep: string | null;
  starts_at: string;
}

export interface ReminderText {
  title: string;
  body: string;
  url: string;
  tag: string;
  subject: string;
  html: string;
  text: string;
  sms: string;
}

// The room opens this many minutes before the start (live room rule).
const ROOM_OPENS_MINUTES = 5;

function clock(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' })
    .format(date)
    .replace(/\s?([AP])M$/i, (_, half: string) => ` ${half.toLowerCase()}m`);
}

function zone(date: Date, tz: string): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName');
  return part ? part.value : tz;
}

function calendarDay(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    date,
  );
}

// "today", "tomorrow" or the weekday, in the club's time zone.
export function dayWord(start: Date, now: Date, tz: string): string {
  const day = calendarDay(start, tz);
  if (day === calendarDay(now, tz)) return 'today';
  if (day === calendarDay(new Date(now.getTime() + 86_400_000), tz)) return 'tomorrow';
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(start);
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function reminderText(item: ReminderItem, tz: string, siteUrl: string, now: Date = new Date()): ReminderText {
  const start = new Date(item.starts_at);
  const time = `${clock(start, tz)} ${zone(start, tz)}`;
  const opens = clock(new Date(start.getTime() - ROOM_OPENS_MINUTES * 60_000), tz);
  const site = siteUrl.replace(/\/+$/, '');
  const prep = (item.prep ?? '').trim();
  const tag = `reminder-${item.booking_id}-${item.kind}`;

  let title: string;
  let body: string;
  let url: string;
  if (item.kind === '24h') {
    title = `${capitalize(dayWord(start, now, tz))}: ${item.title} at ${time}`;
    body = `${prep ? `${prep} ` : ''}Tap to see your session.`;
    url = '/sessions';
  } else {
    title = `${item.title} starts in 1 hour`;
    body = `The room opens at ${opens}. Tap to check your camera and mic.`;
    url = '/camera-check';
  }

  const link = `${site}${url}`;
  const greeting = item.first_name?.trim() ? `Hi ${item.first_name.trim()},` : 'Hi,';
  const footer = `You get this because you booked a MeetDoConnect session. Change reminders: ${site}/reminders`;
  const text = [greeting, '', title + '.', body.replace('Tap to', 'Open this link to'), link, '', footer].join('\n');
  const html =
    `<p>${escapeHtml(greeting)}</p>` +
    `<p><strong>${escapeHtml(title)}</strong></p>` +
    `<p>${escapeHtml(body.replace(/ ?Tap to .*$/, ''))}</p>` +
    `<p><a href="${escapeHtml(link)}">${item.kind === '24h' ? 'See your session' : 'Check your camera and mic'}</a></p>` +
    `<p style="color:#666;font-size:12px">You get this because you booked a MeetDoConnect session. ` +
    `<a href="${escapeHtml(site)}/reminders">Change reminders</a></p>`;
  const sms =
    item.kind === '1h'
      ? `MeetDoConnect: ${item.title} starts in 1 hour (${time}). Room opens ${opens}. ${link} Reply STOP to opt out.`
      : `MeetDoConnect: ${item.title} is ${dayWord(start, now, tz)} at ${time}. ${site}/sessions Reply STOP to opt out.`;

  return { title, body, url, tag, subject: title, html, text, sms };
}
