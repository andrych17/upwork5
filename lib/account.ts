'use client';

// Who is signed in, shared by every header. One Supabase lookup per page load, refreshed when the
// person signs in or out (also in another tab). is_admin only decides whether the Admin link shows;
// the database checks admin rights again on every admin call.
import { useSyncExternalStore } from 'react';
import { getDemoUser, getSupabase } from '@/lib/supabase';

export interface Account {
  id: string;
  name: string;
  email: string;
  initials: string;
  isAdmin: boolean;
}

interface State {
  ready: boolean;
  account: Account | null;
}

const SERVER: State = { ready: false, account: null };
let state: State = SERVER;
let started = false;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach((listener) => listener());
}

function initials(first: string, last: string, email: string): string {
  const letters = `${first.charAt(0)}${last.charAt(0)}`.trim() || email.charAt(0);
  return letters.toUpperCase() || '?';
}

async function refresh() {
  const supabase = getSupabase();
  if (!supabase) {
    // Local preview without Supabase: the demo sign-in stored by the sign-in page.
    const demo = getDemoUser();
    const first = demo?.first_name ?? '';
    const last = demo?.last_name ?? '';
    const email = demo?.email ?? '';
    set({
      ready: true,
      account: demo
        ? { id: demo.id ?? 'demo', name: `${first} ${last}`.trim() || email, email, initials: initials(first, last, email), isAdmin: false }
        : null,
    });
    return;
  }
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) {
    set({ ready: true, account: null });
    return;
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name,last_name,email,is_admin')
    .eq('id', user.id)
    .maybeSingle();
  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  const full = (meta.full_name || meta.name || '').trim();
  const first = profile?.first_name || meta.first_name || meta.given_name || full.split(' ')[0] || '';
  const last = profile?.last_name || meta.last_name || meta.family_name || full.split(' ').slice(1).join(' ');
  const email = profile?.email || user.email || '';
  set({
    ready: true,
    account: {
      id: user.id,
      name: `${first} ${last}`.trim() || email,
      email,
      initials: initials(first, last, email),
      isAdmin: Boolean(profile?.is_admin),
    },
  });
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  void refresh();
  getSupabase()?.auth.onAuthStateChange((event) => {
    // Supabase calls made inside this callback can deadlock, so run the refresh afterwards.
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') setTimeout(() => void refresh(), 0);
  });
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** { ready: false } until the first check finishes, then the signed-in account or null. */
export function useAccount(): State {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER,
  );
}
