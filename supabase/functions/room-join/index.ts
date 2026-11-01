// Live room entry (Milestone 4). The database decides who may enter (room_join, schema section 25); this
// function then makes sure the session's private Daily room exists and hands back a meeting token that only
// works for that person, that room, and until the session ends.
// POST { session_id } -> { url, token, title, slug, starts_at, ends_at, locks_at, name, camera_off, is_admin, people }
// Needs DAILY_API_KEY (Daily dashboard -> Developers). Without it the function answers 503 NOT_CONFIGURED.
import { admin, body, caller, cors, env, fail, json } from '../_shared/http.ts';

const DAILY = 'https://api.daily.co/v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The room and tokens stay valid a little after the hour so nobody is cut off mid-sentence.
const GRACE_SECONDS = 5 * 60;

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
