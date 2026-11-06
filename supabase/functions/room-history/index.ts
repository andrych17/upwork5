// Video history for admins (6 Nov): who was in each live room according to Daily, including admins, people who came
// back after a drop, and when each visit ended. Daily keeps every meeting with its participants; our rooms are named
// mdc-<session id> and every meeting token carries the member's id (room-join), so each visit maps back to a session
// and a member. Shown in Admin > Activity log > Video (Daily).
// POST { days?: 1..90 } (default 30) -> { days, rows: [{ session_id, title, starts_at, user_id, name, is_admin,
//   joined_at, left_at, minutes, ongoing }] }, newest visit first. Admins only. Needs DAILY_API_KEY like room-join.
import { admin, body, caller, cors, env, fail, json, loadKeys } from '../_shared/http.ts';

const DAILY = 'https://api.daily.co/v1';
const ROOM = /^mdc-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 100;
// ponytail: 20 pages = 2,000 meetings, far past a month of sessions. Upgrade path: ask Daily per room
// (/meetings?room=) when an admin opens one session, if the account ever holds more.
const MAX_PAGES = 20;

type Participant = { user_id?: string | null; user_name?: string | null; join_time?: number; duration?: number | null };
type Meeting = { id: string; room?: string; ongoing?: boolean; participants?: Participant[] };
type Person = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  is_admin: boolean;
};

async function meetings(key: string, since: number): Promise<Meeting[]> {
  const all: Meeting[] = [];
  let after = '';
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(
      `${DAILY}/meetings?timeframe_start=${since}&limit=${PAGE}${after && `&starting_after=${after}`}`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) throw new Error(`daily meetings ${res.status}`);
    const { data } = (await res.json()) as { data: Meeting[] };
    all.push(...data);
    if (data.length < PAGE) break;
    after = data[data.length - 1].id;
  }
  return all;
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
    const { data: me } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
    if (!me?.is_admin) return fail(req, 403, 'FORBIDDEN', 'Only an admin can see the video history.');

    const input = await body(req);
    const asked = Number(input?.days);
    const days = Number.isInteger(asked) && asked >= 1 && asked <= 90 ? asked : 30;
    const now = Math.floor(Date.now() / 1000);

    const visits = (await meetings(key, now - days * 86_400)).flatMap((m) => {
      const session = ROOM.exec(m.room ?? '')?.[1];
      if (!session) return [];
      return (m.participants ?? [])
        .filter((p) => p.join_time)
        .map((p) => {
          const ongoing = Boolean(m.ongoing) && p.duration == null;
          const seconds = Math.max(ongoing ? now - p.join_time! : (p.duration ?? 0), 0);
          return {
            session_id: session,
            user_id: p.user_id && UUID.test(p.user_id) ? p.user_id : null,
            daily_name: p.user_name ?? null,
            joined_at: new Date(p.join_time! * 1000).toISOString(),
            left_at: ongoing ? null : new Date((p.join_time! + seconds) * 1000).toISOString(),
            minutes: Math.ceil(seconds / 60),
            ongoing,
          };
        });
    });

    const sessionIds = [...new Set(visits.map((v) => v.session_id))];
    const userIds = [...new Set(visits.flatMap((v) => (v.user_id ? [v.user_id] : [])))];
    const [{ data: sessions }, { data: people }] = await Promise.all([
      sessionIds.length
        ? db.from('sessions').select('id,title,starts_at').in('id', sessionIds)
        : Promise.resolve({ data: [] }),
      userIds.length
        ? db.from('profiles').select('id,first_name,last_name,email,is_admin').in('id', userIds)
        : Promise.resolve({ data: [] }),
    ]);
    const sessionOf = new Map((sessions ?? []).map((s: { id: string; title: string; starts_at: string }) => [s.id, s]));
    const personOf = new Map(((people as Person[] | null) ?? []).map((p) => [p.id, p]));

    const rows = visits
      .map((v) => {
        const s = sessionOf.get(v.session_id);
        const p = v.user_id ? personOf.get(v.user_id) : undefined;
        const name = p
          ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email || 'Member'
          : v.daily_name || 'Unknown';
        return {
          session_id: v.session_id,
          title: s?.title ?? 'Deleted session',
          starts_at: s?.starts_at ?? null,
          user_id: v.user_id,
          name,
          is_admin: Boolean(p?.is_admin),
          joined_at: v.joined_at,
          left_at: v.left_at,
          minutes: v.minutes,
          ongoing: v.ongoing,
        };
      })
      .sort((a, b) => b.joined_at.localeCompare(a.joined_at));
    return json(req, { days, rows });
  } catch (e) {
    console.error('room-history', e);
    return fail(req, 502, 'VIDEO_UNAVAILABLE', 'Could not read the video history from Daily. Please try again.');
  }
});
