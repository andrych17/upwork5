// Buddy games from the database (schema section 27): Slow Chess and Word Rush between two matched buddies.
// The game lives in one row that both people read and change through RPCs; Supabase Realtime pushes changes to
// the other person's open screen. Reads are limited by RLS to the two buddies while their room is open.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GameName } from '@/lib/buddies';

export interface RoundScore {
  score: number;
  words: number;
  done: boolean;
  started_at: string;
}

export interface BuddyGame {
  id: string;
  low_id: string;
  high_id: string;
  game: GameName;
  status: 'active' | 'done';
  /** Slow Chess: who plays White */
  white_id: string | null;
  /** Slow Chess: the engine's move tokens, 'r' = resign */
  moves: string[];
  /** Slow Chess: 'w', 'b' or 'd' once finished */
  result: 'w' | 'b' | 'd' | null;
  /** Word Rush: the deal code (same tiles for both) and minutes per round */
  deal: string | null;
  minutes: number | null;
  /** Word Rush: profile id -> that person's round */
  scores: Record<string, RoundScore>;
  created_at: string;
  updated_at: string;
}

const COLUMNS = 'id,low_id,high_id,game,status,white_id,moves,result,deal,minutes,scores,created_at,updated_at';

type Answer = { success: boolean; error?: string; id?: string; created?: boolean; game?: BuddyGame };

async function rpc(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<Answer> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { success: false, error: 'Could not reach MeetDoConnect. Please try again.' };
  return (data ?? { success: false, error: 'Something went wrong.' }) as Answer;
}

export const otherOf = (g: Pick<BuddyGame, 'low_id' | 'high_id'>, me: string) =>
  g.low_id === me ? g.high_id : g.low_id;

/** Whose turn it is in a Slow Chess game: White moves on even move counts. */
export function chessMover(g: BuddyGame): string | null {
  if (g.status !== 'active' || !g.white_id) return null;
  return g.moves.length % 2 === 0 ? g.white_id : otherOf(g, g.white_id);
}

/** My games with everyone I'm matched with, newest activity first. */
export async function fetchGames(supabase: SupabaseClient): Promise<BuddyGame[] | null> {
  const { data, error } = await supabase
    .from('buddy_games')
    .select(COLUMNS)
    .order('updated_at', { ascending: false })
    .limit(60);
  return error ? null : ((data ?? []) as BuddyGame[]);
}

export async function fetchGame(supabase: SupabaseClient, id: string): Promise<BuddyGame | null> {
  const { data, error } = await supabase.from('buddy_games').select(COLUMNS).eq('id', id).maybeSingle();
  return error ? null : ((data as BuddyGame | null) ?? null);
}

/** Starts a game with a buddy, or opens the one already going. */
export async function startBuddyGame(
  supabase: SupabaseClient,
  buddyId: string,
  game: GameName,
  minutes = 1,
): Promise<{ id: string; error: string }> {
  const res = await rpc(supabase, 'start_buddy_game', { p_with: buddyId, p_game: game, p_minutes: minutes });
  return res.success && res.id
    ? { id: res.id, error: '' }
    : { id: '', error: res.error ?? 'Could not start the game.' };
}

/** Slow Chess: plays one move. `ply` is how many moves I saw; `result` is set when the move ends the game. */
export async function playChessMove(
  supabase: SupabaseClient,
  id: string,
  ply: number,
  token: string,
  result: 'w' | 'b' | 'd' | null,
): Promise<{ game: BuddyGame | null; error: string }> {
  const res = await rpc(supabase, 'buddy_game_move', { p_game: id, p_ply: ply, p_token: token, p_result: result });
  return res.success
    ? { game: res.game ?? null, error: '' }
    : { game: null, error: res.error ?? 'Could not play the move.' };
}

/** Word Rush: saves my running score (first call starts my round, `done` closes it). */
export async function reportScore(
  supabase: SupabaseClient,
  id: string,
  score: number,
  words: number,
  done: boolean,
): Promise<{ game: BuddyGame | null; error: string }> {
  const res = await rpc(supabase, 'buddy_game_score', { p_game: id, p_score: score, p_words: words, p_done: done });
  return res.success
    ? { game: res.game ?? null, error: '' }
    : { game: null, error: res.error ?? 'Could not save the score.' };
}

/** Changes to one game as they happen (the other person's move or score). */
export function subscribeGame(supabase: SupabaseClient, id: string, onChange: (game: BuddyGame) => void): () => void {
  const channel = supabase
    .channel(`buddy-game-${id}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'buddy_games', filter: `id=eq.${id}` },
      (change) => onChange(change.new as BuddyGame),
    )
    .subscribe();
  return () => void supabase.removeChannel(channel);
}

/** Any change to my games (new game, move, score) so lists and badges stay current. */
export function subscribeMyGames(supabase: SupabaseClient, me: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`buddy-games-${me}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'buddy_games', filter: `low_id=eq.${me}` }, onChange)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'buddy_games', filter: `high_id=eq.${me}` },
      onChange,
    )
    .subscribe();
  return () => void supabase.removeChannel(channel);
}

/** One line for lists and chat cards: whose turn, or how it ended. */
export function gameStatus(g: BuddyGame, me: string, buddyName: string): { text: string; mine: boolean } {
  if (g.game === 'Slow Chess') {
    if (g.status === 'done') {
      if (g.result === 'd') return { text: 'Draw', mine: false };
      const winner = g.result === 'w' ? g.white_id : g.white_id ? otherOf(g, g.white_id) : null;
      return { text: winner === me ? 'You won' : `${buddyName} won`, mine: false };
    }
    const mine = chessMover(g) === me;
    return { text: mine ? 'Your move' : `Waiting for ${buddyName}`, mine };
  }
  const mine = g.scores[me];
  const theirs = g.scores[otherOf(g, me)];
  if (g.status === 'done' || (mine?.done && theirs?.done)) {
    const a = mine?.score ?? 0;
    const b = theirs?.score ?? 0;
    return {
      text: a === b ? `Tie, ${a} each` : a > b ? `You won, ${a} to ${b}` : `${buddyName} won, ${b} to ${a}`,
      mine: false,
    };
  }
  if (!mine?.done)
    return {
      text: theirs?.done ? `Your turn to play · ${buddyName} scored ${theirs.score}` : 'Your turn to play',
      mine: true,
    };
  return { text: `You scored ${mine.score} · waiting for ${buddyName}`, mine: false };
}

/** Opens a game on the Games page (the page reads the hash, see components/screens/games.tsx). */
export function openGame(id: string) {
  location.hash = id ? `game=${id}` : '';
}
