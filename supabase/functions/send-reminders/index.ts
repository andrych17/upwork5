// Sends the 24-hour and 1-hour reminders, then the emails about the Hello Video and released holds
// (member_notices, email only, needs RESEND_API_KEY and RESEND_FROM). pg_cron calls this every 5 minutes (supabase/cron-reminders.sql)
// with "Authorization: Bearer <CRON_SECRET>". Deploy with --no-verify-jwt; the secret is the check.
// Each channel runs only when its secrets are set, so it can go live one channel at a time:
// - App notifications: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: or https: address)
// - Email: RESEND_API_KEY, RESEND_FROM (e.g. "MeetDoConnect <reminders@meetdoconnect.com>"), optional REPLY_TO
// - SMS: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM
// A reminder is claimed in the database before sending, so a crash never sends it twice (it is skipped instead).
import { timingSafeEqual } from 'node:crypto';
// @ts-types="npm:@types/web-push@3.6.4"
import webpush from 'npm:web-push@3.6.7';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { admin, env } from '../_shared/http.ts';
import { noticeText, type NoticeItem } from '../_shared/notice-text.ts';
import { reminderText, type ReminderItem, type ReminderText } from '../_shared/reminder-text.ts';

interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface Due extends ReminderItem {
  user_id: string;
  email: string | null;
  phone: string | null;
  minutes: number;
  push: PushTarget[];
}

interface Result {
  booking_id: string;
  kind: string;
  push_sent: number | null;
  email_sent: boolean | null;
  sms_sent: boolean | null;
  error: string | null;
}

const PUSH_HOSTS =
  /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//;

// Runs fn over items with at most `limit` in flight.
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

async function sameSecret(given: string, expected: string): Promise<boolean> {
  const digest = async (value: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return timingSafeEqual(await digest(given), await digest(expected));
}

function addError(result: Result, message: string) {
  result.error = result.error ? `${result.error}; ${message}` : message;
}

// ---- App notifications -------------------------------------------------------------------------
async function sendPush(items: Due[], texts: Map<Due, ReminderText>, results: Map<Due, Result>, dead: Set<string>) {
  const publicKey = env('VAPID_PUBLIC_KEY');
  const privateKey = env('VAPID_PRIVATE_KEY');
  if (!publicKey || !privateKey) return;
  const subject = env('VAPID_SUBJECT') ?? env('SITE_URL') ?? 'https://meetdoconnect.com';

  const jobs = items.flatMap((item) => item.push.map((target) => ({ item, target })));
  for (const { item } of jobs) results.get(item)!.push_sent ??= 0;

  await pool(jobs, 10, async ({ item, target }) => {
    const result = results.get(item)!;
    if (!PUSH_HOSTS.test(target.endpoint)) return;
    const text = texts.get(item)!;
    const secondsLeft = Math.floor((new Date(item.starts_at).getTime() - Date.now()) / 1000);
    try {
      const details = webpush.generateRequestDetails(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify({ title: text.title, body: text.body, url: text.url, tag: text.tag }),
        {
          vapidDetails: { subject, publicKey, privateKey },
          TTL: Math.max(60, Math.min(secondsLeft, 86_400)),
          urgency: item.kind === '1h' ? 'high' : 'normal',
        },
      );
      const res = await fetch(details.endpoint, {
        method: details.method,
        // web-push gives TTL as a number
        headers: Object.fromEntries(Object.entries(details.headers).map(([name, value]) => [name, String(value)])),
        body: new Uint8Array(details.body as Uint8Array),
        signal: AbortSignal.timeout(10_000),
      });
      await res.body?.cancel();
      if (res.ok) result.push_sent! += 1;
      else if (res.status === 404 || res.status === 410) dead.add(target.endpoint);
      else addError(result, `push ${res.status}`);
    } catch (e) {
      addError(result, `push ${(e as Error).message}`);
    }
  });
}

// ---- Email (Resend batch: up to 100 emails per call) --------------------------------------------
async function sendEmail(items: Due[], texts: Map<Due, ReminderText>, results: Map<Due, Result>) {
  const key = env('RESEND_API_KEY');
  const from = env('RESEND_FROM');
  if (!key || !from) return;
  const replyTo = env('REPLY_TO');
  const withEmail = items.filter((item) => item.email);

  for (let i = 0; i < withEmail.length; i += 100) {
    const chunk = withEmail.slice(i, i + 100);
    const payload = chunk.map((item) => {
      const text = texts.get(item)!;
      return {
        from,
        to: [item.email],
        subject: text.subject,
        html: text.html,
        text: text.text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      };
    });
    try {
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      });
      const ok = res.ok;
      const detail = ok ? '' : (await res.text()).slice(0, 200);
      if (ok) await res.body?.cancel();
      for (const item of chunk) {
        const result = results.get(item)!;
        result.email_sent = ok;
        if (!ok) addError(result, `email ${res.status} ${detail}`);
      }
    } catch (e) {
      for (const item of chunk) {
        results.get(item)!.email_sent = false;
        addError(results.get(item)!, `email ${(e as Error).message}`);
      }
    }
  }
}

// ---- SMS (Twilio, only people who opted in; app_config.sms_kinds picks 24h and/or 1h) ------------
async function sendSms(items: Due[], texts: Map<Due, ReminderText>, results: Map<Due, Result>) {
  const sid = env('TWILIO_ACCOUNT_SID');
  const token = env('TWILIO_AUTH_TOKEN');
  const service = env('TWILIO_MESSAGING_SERVICE_SID');
  const from = env('TWILIO_FROM');
  if (!sid || !token || (!service && !from)) return;
  const auth = `Basic ${btoa(`${sid}:${token}`)}`;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;

  await pool(
    items.filter((item) => item.phone),
    5,
    async (item) => {
      const result = results.get(item)!;
      const form = new URLSearchParams({ To: item.phone!, Body: texts.get(item)!.sms });
      if (service) form.set('MessagingServiceSid', service);
      else form.set('From', from!);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form,
          signal: AbortSignal.timeout(10_000),
        });
        result.sms_sent = res.ok;
        if (!res.ok) {
          const detail = (await res.json().catch(() => ({}))) as { code?: number };
          addError(result, `sms ${res.status}${detail.code ? ` ${detail.code}` : ''}`);
        } else await res.body?.cancel();
      } catch (e) {
        result.sms_sent = false;
        addError(result, `sms ${(e as Error).message}`);
      }
    },
  );
}

// ---- Hello Video and held-booking emails ---------------------------------------------------------
// Notices are claimed in the database before sending, so without Resend set up nothing is claimed and they wait.
async function sendNotices(db: SupabaseClient, site: string): Promise<{ notices: number; notices_failed: number }> {
  const key = env('RESEND_API_KEY');
  const from = env('RESEND_FROM');
  if (!key || !from) return { notices: 0, notices_failed: 0 };
  const { data, error } = await db.rpc('claim_member_notices', { p_limit: 100 });
  if (error) throw new Error(`claim_member_notices: ${error.message}`);
  const items = Array.isArray(data) ? (data as NoticeItem[]) : [];
  if (!items.length) return { notices: 0, notices_failed: 0 };

  const replyTo = env('REPLY_TO');
  const withEmail = items.filter((item) => item.email);
  let failure: string | null = null;
  if (withEmail.length) {
    try {
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(
          withEmail.map((item) => {
            const text = noticeText(item, site);
            return { from, to: [item.email], subject: text.subject, html: text.html, text: text.text, ...(replyTo ? { reply_to: replyTo } : {}) };
          }),
        ),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) failure = `email ${res.status} ${(await res.text()).slice(0, 200)}`;
      else await res.body?.cancel();
    } catch (e) {
      failure = `email ${(e as Error).message}`;
    }
  }
  const rows = items.map((item) => ({
    id: item.id,
    email_sent: item.email ? failure === null : false,
    error: item.email ? failure : 'no email address',
  }));
  const { error: recordError } = await db.rpc('record_notice_results', { p_results: rows });
  if (recordError) console.error('record_notice_results', recordError.message);
  return { notices: rows.filter((row) => row.email_sent).length, notices_failed: rows.filter((row) => !row.email_sent).length };
}

async function sendReminders(db: SupabaseClient, site: string) {
  const { data, error } = await db.rpc('claim_due_reminders', { p_limit: 300 });
  if (error) throw new Error(`claim_due_reminders: ${error.message}`);
  const { tz, items } = data as { tz: string; items: Due[] };
  if (!items.length) return { claimed: 0 };

  const now = new Date();
  const texts = new Map(items.map((item) => [item, reminderText(item, tz, site, now)]));
  const results = new Map<Due, Result>(
    items.map((item) => [
      item,
      {
        booking_id: item.booking_id,
        kind: item.kind,
        push_sent: null,
        email_sent: null,
        sms_sent: null,
        error: null,
      },
    ]),
  );
  const dead = new Set<string>();

  await Promise.all([
    sendPush(items, texts, results, dead),
    sendEmail(items, texts, results),
    sendSms(items, texts, results),
  ]);

  if (dead.size) {
    const { error: deadError } = await db.rpc('delete_push_endpoints', { p_endpoints: [...dead] });
    if (deadError) console.error('delete_push_endpoints', deadError.message);
  }
  const rows = [...results.values()];
  const { error: recordError } = await db.rpc('record_reminder_results', { p_results: rows });
  if (recordError) console.error('record_reminder_results', recordError.message);

  return {
    claimed: items.length,
    push: rows.reduce((sum, row) => sum + (row.push_sent ?? 0), 0),
    email: rows.filter((row) => row.email_sent).length,
    sms: rows.filter((row) => row.sms_sent).length,
    failed: rows.filter((row) => row.error).length,
    removed_devices: dead.size,
  };
}

Deno.serve(async (req) => {
  const secret = env('CRON_SECRET');
  if (!secret)
    return Response.json({ error: { code: 'NOT_CONFIGURED', message: 'CRON_SECRET is not set.' } }, { status: 503 });
  const given = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (req.method !== 'POST' || !(await sameSecret(given, secret))) {
    return Response.json({ error: { code: 'UNAUTHORIZED', message: 'Not allowed.' } }, { status: 401 });
  }

  try {
    const db = admin();
    const site = env('SITE_URL') ?? 'https://meetdoconnect.com';
    const reminders = await sendReminders(db, site);
    const notices = await sendNotices(db, site);
    return Response.json({ ...reminders, ...notices });
  } catch (e) {
    console.error('send-reminders', e);
    return Response.json(
      { error: { code: 'SERVER_ERROR', message: 'Sending failed; see the function logs.' } },
      { status: 500 },
    );
  }
});
