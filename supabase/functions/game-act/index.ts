// Live-room games (schema section 38): Invent It, Guess Whose Story, Puzzle Room and Draw and Guess. Every move of a
// session's game runs here with Kelly's engine, so nobody can move for someone else or read what is hidden from them.
// POST { session_id, action: { type, ... } } -> { view, own, rev, now, game }  (own = the view is only this player's)
// game_seat checks the seat and the room window and gives the player's first name, the session's end (the engine ends
// the game there) and which game the session plays. Deploy with JWT verification on (the default).
import { admin, body, caller, cors, fail, json } from '../_shared/http.ts';
import {
  cleanMove,
  engine,
  type GameState,
  gameData,
  isGame,
  newRoom,
  timeoutTooEarly,
  viewsOf,
} from '../_shared/live-games.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Two people moving at the same moment: the slower one reloads the newer state and tries again.
const MAX_TRIES = 5;
// A Draw and Guess line can carry up to 800 points.
const MAX_BODY = 24_000;

type Seat = { success: boolean; error?: string; name?: string; ends_at?: string; game?: string };
type Row = { game: string; state: GameState; rev: number };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return fail(req, 405, 'METHOD_NOT_ALLOWED', 'Use POST.');

  try {
    const db = admin();
    const user = await caller(req, db);
    if (!user) return fail(req, 401, 'UNAUTHORIZED', 'Please sign in again.');
    const input = await body(req, MAX_BODY);
    const sessionId = typeof input?.session_id === 'string' && UUID.test(input.session_id) ? input.session_id : null;
    if (!sessionId) return fail(req, 400, 'BAD_REQUEST', 'Missing session.');

    const { data: seat, error: seatError } = await db.rpc('game_seat', { p_user: user.id, p_session: sessionId });
    if (seatError) throw new Error(`game_seat: ${seatError.message}`);
    const s = seat as Seat;
    if (!s.success) return fail(req, 403, 'NOT_ALLOWED', s.error ?? 'You can’t play in this room.');
    const game = s.game;
    if (!isGame(game)) return fail(req, 404, 'NO_GAME', 'This session has no game yet.');
    const action = cleanMove(game, input?.action);
    if (!action) return fail(req, 400, 'BAD_REQUEST', 'That move isn’t part of this game.');

    const endsAt = s.ends_at ? Date.parse(s.ends_at) || undefined : undefined;
    const T = engine(game);
    for (let i = 0; i < MAX_TRIES; i++) {
      const { data, error } = await db
        .from('game_rooms')
        .select('game, state, rev')
        .eq('session_id', sessionId)
        .maybeSingle();
      if (error) throw new Error(`game_rooms: ${error.message}`);
      const row = data as Row | null;
      if (!row && action.type !== 'join')
        return fail(req, 404, 'NO_GAME', 'The game isn’t set up yet. Refresh the page.');

      const rev = row ? row.rev : -1;
      // A session that switched games (an admin renamed it) starts the new game fresh.
      const state = row && row.game === game ? row.state : newRoom(game, sessionId);
      const now = Date.now();
      if (row && row.game === game && timeoutTooEarly(state, action, now, endsAt)) {
        const { pub, own } = viewsOf(game, state, now);
        const mine = own[user.id] ?? pub;
        return json(req, { view: mine, own: mine !== pub, rev, now, game });
      }
      const moved = T.apply(
        state,
        { ...action, id: user.id, name: s.name ?? 'Member' },
        { ...gameData(game), now, endsAt },
      );
      if (!moved.ok) return fail(req, 409, 'MOVE_REFUSED', moved.error);

      const { pub, own } = viewsOf(game, moved.state, now);
      const mine = own[user.id] ?? pub;
      // Nothing changed (joining again after a reload): no save, so nobody gets a needless update.
      if (row && row.game === game && JSON.stringify(moved.state) === JSON.stringify(row.state))
        return json(req, { view: mine, own: mine !== pub, rev, now, game });

      const { data: saved, error: saveError } = await db.rpc('game_save', {
        p_session: sessionId,
        p_game: game,
        p_rev: rev,
        p_state: moved.state,
        p_view: pub,
        p_own: own,
      });
      if (saveError) throw new Error(`game_save: ${saveError.message}`);
      if (saved) return json(req, { view: mine, own: mine !== pub, rev: rev + 1, now, game });
    }
    return fail(req, 409, 'BUSY', 'The game was busy. Please try again.');
  } catch (e) {
    console.error('game-act', e);
    return fail(req, 502, 'GAME_UNAVAILABLE', 'The game didn’t respond. Please try again in a moment.');
  }
});
