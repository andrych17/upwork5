// Trivia, Trivier, Triviest (schema section 31). Every move of a session's game runs here with Kelly's engine, so
// the page never sees an answer and nobody can play for someone else.
// POST { session_id, action: { type, ... } } -> { state, card, rev, now, categories }
// The player is the signed-in member: trivia_seat checks the seat and the room window and gives the first name and
// the session's end, which is when Kelly's engine ends the game (the highest score wins).
// Deploy with JWT verification on (the default).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { admin, body, caller, cors, fail, json } from '../_shared/http.ts';
import {
  type Bank,
  cleanAction,
  engine,
  type GameState,
  joinSecret,
  type Secret,
  splitSecret,
} from '../_shared/trivia-room.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BANK_TTL_MS = 60_000;
// Two people moving at the same moment: the slower one reloads the newer state and tries again.
const MAX_TRIES = 5;

let cached: { at: number; bank: Bank } | null = null;

async function loadBank(db: SupabaseClient): Promise<Bank> {
  if (cached && Date.now() - cached.at < BANK_TTL_MS) return cached.bank;
  const [cats, qs] = await Promise.all([
    db.from('trivia_categories').select('id, name, color').order('sort').order('id'),
    db.from('trivia_questions').select('id, cat, q, a, wrong, note, source').eq('active', true).order('id'),
  ]);
  if (cats.error || qs.error) throw new Error(`trivia bank: ${(cats.error ?? qs.error)?.message}`);
  const checked = engine().validateBank({ categories: cats.data, questions: qs.data });
  // One bad question (edited by hand in the dashboard) is left out instead of stopping every game.
  if (!checked.ok) console.error('trivia bank', checked.errors.slice(0, 5));
  if (checked.bank.categories.length < 2 || !checked.bank.questions.length)
    throw new Error(`trivia bank: ${checked.errors[0] ?? 'empty'}`);
  cached = { at: Date.now(), bank: checked.bank };
  return checked.bank;
}

type Row = { state: GameState; rev: number; trivia_room_secrets: { secret: Secret } | { secret: Secret }[] | null };

const secretOf = (row: Row): Secret | undefined =>
  (Array.isArray(row.trivia_room_secrets) ? row.trivia_room_secrets[0] : row.trivia_room_secrets)?.secret;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return fail(req, 405, 'METHOD_NOT_ALLOWED', 'Use POST.');

  try {
    const db = admin();
    const user = await caller(req, db);
    if (!user) return fail(req, 401, 'UNAUTHORIZED', 'Please sign in again.');
    const input = await body(req);
    const sessionId = typeof input?.session_id === 'string' && UUID.test(input.session_id) ? input.session_id : null;
    const action = cleanAction(input?.action);
    if (!sessionId || !action) return fail(req, 400, 'BAD_REQUEST', 'Missing session or move.');

    const { data: seat, error: seatError } = await db.rpc('trivia_seat', { p_user: user.id, p_session: sessionId });
    if (seatError) throw new Error(`trivia_seat: ${seatError.message}`);
    const s = seat as { success: boolean; error?: string; name?: string; ends_at?: string };
    if (!s.success) return fail(req, 403, 'NOT_ALLOWED', s.error ?? 'You can’t play in this room.');

    const endsAt = s.ends_at ? Date.parse(s.ends_at) || undefined : undefined;
    const bank = await loadBank(db);
    const T = engine();
    for (let i = 0; i < MAX_TRIES; i++) {
      const { data, error } = await db
        .from('trivia_rooms')
        .select('state, rev, trivia_room_secrets(secret)')
        .eq('session_id', sessionId)
        .maybeSingle();
      if (error) throw new Error(`trivia_rooms: ${error.message}`);
      const row = data as Row | null;
      if (!row && action.type !== 'join')
        return fail(req, 404, 'NO_GAME', 'The game isn’t set up yet. Refresh the page.');

      const rev = row ? row.rev : -1;
      const state = row ? joinSecret(row.state, secretOf(row)) : T.newRoom(sessionId, bank.categories.length);
      const now = Date.now();
      const moved = T.apply(state, { ...action, id: user.id, name: s.name ?? 'Member' }, { bank, now, endsAt });
      if (!moved.ok) return fail(req, 409, 'MOVE_REFUSED', moved.error);
      // A game that ended because players left goes back to the lobby with its last result still set.
      if (action.type === 'start') moved.state.last = null;

      const { pub, secret } = splitSecret(moved.state);
      const card = T.cardFor(moved.state, bank);
      const { data: saved, error: saveError } = await db.rpc('trivia_save', {
        p_session: sessionId,
        p_rev: rev,
        p_state: pub,
        p_card: card,
        p_secret: secret,
      });
      if (saveError) throw new Error(`trivia_save: ${saveError.message}`);
      if (saved) return json(req, { state: pub, card, rev: rev + 1, now, categories: bank.categories });
    }
    return fail(req, 409, 'BUSY', 'The game was busy. Please try again.');
  } catch (e) {
    console.error('trivia-act', e);
    return fail(req, 502, 'GAME_UNAVAILABLE', 'The game didn’t respond. Please try again in a moment.');
  }
});
