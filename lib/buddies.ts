// Buddy Rooms from the database (schema section 26): the people in a session, private picks, matches and the
// 1:1 chat. Every write goes through an RPC that checks the match; reads are limited by RLS.
import type { SupabaseClient } from '@supabase/supabase-js';

export const MAX_PICKS = 3;

export interface SessionPerson {
  id: string;
  first_name: string;
  avatar_url: string | null;
  /** I picked them in this session */
  picked: boolean;
  /** we picked each other (only then is their pick visible) */
  matched: boolean;
}

export interface SessionPeople {
  session: { id: string; slug: string; title: string; starts_at: string; minutes: number };
  can_pick: boolean;
  picks_close_at: string;
  people: SessionPerson[];
}

export interface Buddy {
  id: string;
  first_name: string;
  avatar_url: string | null;
  last_body: string | null;
  last_kind: MessageKind | null;
  last_at: string | null;
  last_from_me: boolean | null;
}

export type MessageKind = 'text' | 'session' | 'game';
export type GameName = 'Word Rush' | 'Slow Chess';

export interface BuddyMessage {
  id: string;
  low_id: string;
  high_id: string;
  sender_id: string;
  kind: MessageKind;
  body: string;
  payload: { slug?: string; game?: GameName } | null;
  created_at: string;
}

type Answer = { success: boolean; error?: string } & Record<string, unknown>;

async function rpc(supabase: SupabaseClient, fn: string, args: Record<string, unknown> = {}): Promise<Answer> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { success: false, error: 'Could not reach MeetDoConnect. Please try again.' };
  return (data ?? { success: false, error: 'Something went wrong.' }) as Answer;
}

export async function getSessionPeople(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{ data: SessionPeople | null; error: string }> {
  const res = await rpc(supabase, 'get_session_people', { p_session: sessionId });
  return res.success ? { data: res as unknown as SessionPeople, error: '' } : { data: null, error: res.error ?? '' };
}

/** Saves my picks for a session and returns who matched. */
export async function saveBuddyPicks(
  supabase: SupabaseClient,
  sessionId: string,
  ids: string[],
): Promise<{ matched: Pick<Buddy, 'id' | 'first_name' | 'avatar_url'>[]; error: string }> {
  const res = await rpc(supabase, 'save_buddy_picks', { p_session: sessionId, p_ids: ids });
  return res.success
    ? { matched: (res.matched ?? []) as Pick<Buddy, 'id' | 'first_name' | 'avatar_url'>[], error: '' }
    : { matched: [], error: res.error ?? 'Could not save your picks.' };
}

export async function getMyBuddies(supabase: SupabaseClient): Promise<Buddy[] | null> {
  const { data, error } = await supabase.rpc('get_my_buddies');
  return error ? null : ((data ?? []) as Buddy[]);
}

const pair = (a: string, b: string) => (a < b ? [a, b] : [b, a]);

/** The newest 100 messages between me and a buddy, oldest first. */
export async function fetchMessages(
  supabase: SupabaseClient,
  me: string,
  other: string,
): Promise<BuddyMessage[] | null> {
  const [low, high] = pair(me, other);
  const { data, error } = await supabase
    .from('buddy_messages')
    .select('id,low_id,high_id,sender_id,kind,body,payload,created_at')
    .eq('low_id', low)
    .eq('high_id', high)
    .order('created_at', { ascending: false })
    .limit(100);
  return error ? null : ((data ?? []) as BuddyMessage[]).reverse();
}

/** Returns an error message, or '' when sent. */
export async function sendBuddyMessage(
  supabase: SupabaseClient,
  to: string,
  kind: MessageKind,
  body: string,
  payload: BuddyMessage['payload'] = null,
): Promise<string> {
  const res = await rpc(supabase, 'send_buddy_message', { p_to: to, p_kind: kind, p_body: body, p_payload: payload });
  return res.success ? '' : (res.error ?? 'Could not send. Please try again.');
}

/** "Block": removes my picks of them, which closes the room for both. */
export async function unpickBuddy(supabase: SupabaseClient, other: string): Promise<string> {
  const res = await rpc(supabase, 'unpick_buddy', { p_other: other });
  return res.success ? '' : (res.error ?? 'Could not close the room.');
}

/** New messages in one Buddy Room as they arrive (Supabase Realtime; RLS decides who receives them). */
export function subscribeMessages(
  supabase: SupabaseClient,
  me: string,
  other: string,
  onMessage: (message: BuddyMessage) => void,
): () => void {
  const [low, high] = pair(me, other);
  const channel = supabase
    .channel(`buddy-${low}-${high}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'buddy_messages', filter: `low_id=eq.${low}` },
      (change) => {
        const row = change.new as BuddyMessage;
        if (row.high_id === high) onMessage(row);
      },
    )
    .subscribe();
  return () => void supabase.removeChannel(channel);
}

export const initials = (name: string) => name.trim().charAt(0).toUpperCase() || '?';

/** The /games hash that opens a game with a buddy: "Slow Chess" -> play=chess&with=Maya */
export const gameHash = (game: GameName | string | undefined, name: string) =>
  `play=${game === 'Slow Chess' ? 'chess' : 'word'}&with=${encodeURIComponent(name)}`;
