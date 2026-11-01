import { useSyncExternalStore } from 'react';

// Buddy Room state shared by After session, Calendar and Book, kept in sessionStorage so an invite survives the
// trip to the calendar and back. With Supabase only `inviting`/`invitingId` are used (the buddy being invited);
// the rest is the sample Buddy Room for the local preview without a database.

export const MAX_PICKS = 3;

export interface BuddyDemo {
  picks: string[];
  saved: boolean;
  /** Buddy Room that is open */
  chat: string | null;
  /** buddy being invited while the member browses the calendar (name, and profile id when live) */
  inviting: string | null;
  invitingId: string | null;
  /** buddy name -> booked session slug */
  sessionInvites: Record<string, string>;
  gameInvites: Record<string, string>;
  messages: Record<string, string[]>;
}

const KEY = 'meetdoconnect.buddy-demo';
const EMPTY: BuddyDemo = {
  picks: [],
  saved: false,
  chat: null,
  inviting: null,
  invitingId: null,
  sessionInvites: {},
  gameInvites: {},
  messages: {},
};

const listeners = new Set<() => void>();
let state: BuddyDemo | null = null;

function current(): BuddyDemo {
  if (state) return state;
  state = EMPTY;
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) state = { ...EMPTY, ...saved };
  } catch {
    /* storage blocked or unreadable: start fresh */
  }
  return state;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function updateBuddyDemo(change: (demo: BuddyDemo) => BuddyDemo) {
  state = change(current());
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage blocked: the demo still works until the page reloads */
  }
  listeners.forEach((listener) => listener());
}

export function useBuddyDemo(): BuddyDemo {
  return useSyncExternalStore(subscribe, current, () => EMPTY);
}
