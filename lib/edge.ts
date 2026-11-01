import { FunctionsHttpError } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';

export type EdgeResult<T> = { data: T; error: null } | { data: null; error: string };

/** Calls a Supabase Edge Function (supabase/functions) with the signed-in session and returns its message on failure. */
export async function callEdge<T>(name: string, body: Record<string, unknown>): Promise<EdgeResult<T>> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: 'Accounts are not connected yet.' };
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return { data: data as T, error: null };
  if (error instanceof FunctionsHttpError) {
    const payload = (await error.context.json().catch(() => null)) as { error?: { message?: string } } | null;
    return { data: null, error: payload?.error?.message ?? 'Something went wrong. Please try again.' };
  }
  return { data: null, error: 'Could not reach MeetDoConnect. Check your connection and try again.' };
}
