// Live room entry (Milestone 4). The database decides who may enter (room_join, schema section 25); this
// function then makes sure the session's private Daily room exists and hands back a meeting token that only
// works for that person, that room, and until the session ends.
// POST { session_id } -> { url, token, title, slug, starts_at, ends_at, locks_at, name, camera_off, is_admin, people }
// Needs DAILY_API_KEY (Daily dashboard -> Developers). Without it the function answers 503 NOT_CONFIGURED.
// DAILY_MONTHLY_MINUTES: participant minutes over the last 31 days after which nobody new gets a video token, so the
// Daily account stays inside its free minutes (10,000 a month). Unset means DEFAULT_MINUTES_LIMIT; "0" turns it off.
// Admin > Settings > Connections can set it too. If Daily's usage can't be read, nobody new gets in either.
import { admin, body, caller, cors, env, fail, json, loadKeys } from '../_shared/http.ts';

const DAILY = 'https://api.daily.co/v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The room and tokens stay valid a little after the hour so nobody is cut off mid-sentence.
const GRACE_SECONDS = 5 * 60;
const DEFAULT_MINUTES_LIMIT = 8000;
const WINDOW_DAYS = 31;
const USAGE_TTL_MS = 5 * 60_000;
// When Daily can't be asked, a reading this recent still counts; anything older and the room stays shut.
const USAGE_STALE_MS = 60 * 60_000;
const PAGE = 100;
const MAX_PAGES = 50;

type Join = {
  success: boolean;
  error?: string;
  title: string;
  slug: string;
  starts_at: string;
  ends_at: string;
  locks_at: string;
  capacity: number;
  name: string;
  camera_off: boolean;
  is_admin: boolean;
  people: { id: string; name: string; avatar_url: string | null }[];
};

async function daily(key: string, path: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(`${DAILY}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

let usage: { at: number; minutes: number } | null = null;

type Meeting = { id: string; ongoing?: boolean; participants?: { join_time?: number; duration?: number | null }[] };

/**
 * Participant minutes over the last 31 days, from Daily's meeting list (read again every 5 minutes). A rolling
 * window covers whatever day Daily's billing month starts on. People still in a call count from when they joined.
 */
async function minutesUsed(key: string): Promise<number> {
  if (usage && Date.now() - usage.at < USAGE_TTL_MS) return usage.minutes;
  const now = Math.floor(Date.now() / 1000);
  const since = now - WINDOW_DAYS * 86_400;
  let seconds = 0;
  let after = '';
  for (let page = 0; ; page++) {
    // Stopping early would undercount, so too many pages is treated like Daily not answering.
    if (page === MAX_PAGES) throw new Error('daily meetings: too many pages');
    const res = await daily(
      key,
      `/meetings?timeframe_start=${since}&limit=${PAGE}${after && `&starting_after=${after}`}`,
    );
    if (!res.ok) throw new Error(`daily meetings ${res.status}`);
    const { data } = (await res.json()) as { data: Meeting[] };
    for (const m of data)
      for (const p of m.participants ?? []) {
        const live = m.ongoing && p.join_time ? now - p.join_time : 0;
        seconds += Math.max(p.duration ?? 0, live, 0);
      }
    if (data.length < PAGE) break;
    after = data[data.length - 1].id;
  }
  usage = { at: Date.now(), minutes: Math.ceil(seconds / 60) };
  return usage.minutes;
}

/** Whether the minutes limit lets one more person in. */
async function videoLimit(key: string): Promise<'ok' | 'full' | 'unknown'> {
  const set = env('DAILY_MONTHLY_MINUTES');
  const limit = set === undefined ? DEFAULT_MINUTES_LIMIT : Number(set);
  if (!Number.isFinite(limit)) return 'unknown';
  if (limit <= 0) return 'ok';
  try {
    return (await minutesUsed(key)) >= limit ? 'full' : 'ok';
  } catch (e) {
    console.error('room-join usage', e);
    if (usage && Date.now() - usage.at < USAGE_STALE_MS) return usage.minutes >= limit ? 'full' : 'ok';
    return 'unknown';
  }
}

/** The session's room: reused if it exists, otherwise created private, capped and expiring with the session. */
async function ensureRoom(key: string, name: string, exp: number, maxPeople: number): Promise<string> {
  const found = await daily(key, `/rooms/${name}`);
  if (found.ok) return ((await found.json()) as { url: string }).url;
  if (found.status !== 404) throw new Error(`daily get room ${found.status}`);
  const made = await daily(key, '/rooms', {
    method: 'POST',
    body: JSON.stringify({
      name,
      privacy: 'private',
      properties: {
        exp,
        eject_at_room_exp: true,
        max_participants: maxPeople,
        enable_chat: false,
        enable_screenshare: false,
        enable_knocking: false,
        enable_prejoin_ui: false,
      },
    }),
  });
  if (made.ok) return ((await made.json()) as { url: string }).url;
  // Two people joining at the same moment: the other request created it first.
  if (made.status === 400) {
    const again = await daily(key, `/rooms/${name}`);
    if (again.ok) return ((await again.json()) as { url: string }).url;
  }
  throw new Error(`daily create room ${made.status}`);
}

async function meetingToken(key: string, room: string, userId: string, j: Join, exp: number): Promise<string> {
  const res = await daily(key, '/meeting-tokens', {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        room_name: room,
        user_id: userId,
        user_name: j.name,
        is_owner: j.is_admin,
        exp,
        eject_at_token_exp: true,
        start_video_off: j.camera_off,
        enable_screenshare: false,
      },
    }),
  });
  if (!res.ok) throw new Error(`daily token ${res.status}`);
  return ((await res.json()) as { token: string }).token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return fail(req, 405, 'METHOD_NOT_ALLOWED', 'Use POST.');

  await loadKeys();
  const key = env('DAILY_API_KEY');
  if (!key) return fail(req, 503, 'NOT_CONFIGURED', 'Live video rooms are not switched on yet.');

  try {
    const db = admin();
    const user = await caller(req, db);
    if (!user) return fail(req, 401, 'UNAUTHORIZED', 'Please sign in again.');
    const input = await body(req);
    const sessionId = typeof input?.session_id === 'string' && UUID.test(input.session_id) ? input.session_id : null;
    if (!sessionId) return fail(req, 400, 'BAD_REQUEST', 'Missing session.');

    const { data, error } = await db.rpc('room_join', { p_user: user.id, p_session: sessionId });
    if (error) throw new Error(`room_join: ${error.message}`);
    const j = data as Join;
    if (!j.success) return fail(req, 403, 'NOT_ALLOWED', j.error ?? 'You can’t join this room.');

    const limit = await videoLimit(key);
    if (limit === 'full')
      return fail(
        req,
        503,
        'VIDEO_LIMIT',
        'Video rooms have used their minutes for now. Please let the MeetDoConnect team know.',
      );
    if (limit === 'unknown')
      return fail(
        req,
        503,
        'VIDEO_LIMIT_UNKNOWN',
        'Video can’t check its minutes right now. Please try again in a minute.',
      );

    const exp = Math.floor(new Date(j.ends_at).getTime() / 1000) + GRACE_SECONDS;
    const room = `mdc-${sessionId}`;
    // Seats plus room for an admin and the host.
    const url = await ensureRoom(key, room, exp, j.capacity + 2);
    const token = await meetingToken(key, room, user.id, j, exp);
    const { success: _ok, capacity: _cap, ...rest } = j;
    return json(req, { url, token, ...rest });
  } catch (e) {
    console.error('room-join', e);
    return fail(req, 502, 'VIDEO_UNAVAILABLE', 'The video room didn’t start. Please try again in a moment.');
  }
});
