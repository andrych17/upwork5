// Sessions ("rooms") from the database for the member pages: calendar, booking page, My sessions and the
// phone tab bar. get_schedule() (schema section 22) returns published sessions with seat counts and, for a
// signed-in member, their own seat. Activity content (prep card, how the hour flows) comes from the catalog
// in lib/session-data when the session belongs to one of the twelve rooms.
import type { SupabaseClient } from '@supabase/supabase-js';
import { ADMIN_TZ, fromCentralInput } from '@/lib/admin';
import { prepCards, type SessionContent } from '@/lib/session-data';

export interface Room {
  id: string;
  slug: string;
  title: string;
  blurb: string | null;
  host: string;
  prep: string | null;
  starts_at: string;
  minutes: number;
  capacity: number;
  booked: number;
  /** booking closes here (app_config.booking_closes_minutes before the start; negative = after it) */
  closes_at: string;
  /** free cancellation until here (app_config.cancel_hours before the start) */
  cancel_by: string;
  my_booking_id: string | null;
  my_camera_off: boolean | null;
  my_held: boolean | null;
}

// Short labels for the calendar rows, per catalog room.
const SHORT: Record<string, { audience: string; prep: string }> = {
  'quiet-co-work': { audience: 'Adults & teens', prep: 'One task, a drink, and your phone out of reach.' },
  'wind-down': { audience: 'Everyone', prep: 'Blanket, herbal tea, journal, and pen.' },
  'write-together': { audience: 'Adults & teens', prep: 'Notebook or blank document and a favorite drink.' },
  'botanical-sketch-night': { audience: 'Adults & teens', prep: 'Paper, pencil, black pen, and a leaf or herb sprig.' },
  'skin-ritual': {
    audience: 'Teens, solos & couples',
    prep: 'Ground oats, yogurt or banana, honey, cooled green tea, cucumber, and mint.',
  },
  'cards-and-collage-night': {
    audience: 'Families welcome',
    prep: 'Scrap paper, magazines, glue stick, scissors, and card stock.',
  },
  'idea-lab': { audience: 'Adults & teens', prep: 'A half-formed idea and a short elevator pitch.' },
  'mocktail-studio': { audience: 'Families welcome', prep: 'Cranberry, ginger, sparkling water, lime, and rosemary.' },
  'byo-dad-jokes': { audience: 'Families, adults & teens', prep: 'Bring your groan-iest one-liner, story, or pun.' },
  'dont-spill-the-tea': {
    audience: 'Couples, friends & solos',
    prep: 'Three mystery teas, a kettle, two mugs, and a tasting card.',
  },
  'share-a-song': {
    audience: 'Adults & teens',
    prep: 'A second device for playing a favorite song and your playlist.',
  },
  'trivia-trivier-triviest': { audience: 'Adults & teens', prep: 'No prep. Just show up and guess.' },
};

const TONES = ['navy', 'berry', 'leaf', 'sky', 'plum', 'gold', 'coral', 'cobalt', 'tomato', 'sage', 'violet', 'ink'];

/** The catalog room a session belongs to: same slug, or an admin-made "<room>-<date>" slug, or the same title. */
export function catalogFor(room: Pick<Room, 'slug' | 'title'>): SessionContent | undefined {
  const title = room.title.trim().toLowerCase();
  return (
    prepCards.find((c) => room.slug === c.slug || room.slug.startsWith(`${c.slug}-`)) ??
    prepCards.find((c) => c.title.toLowerCase() === title)
  );
}

/** Everything the pages show for a session, catalog first, then what the admin typed. */
export function roomInfo(room: Room) {
  const card = catalogFor(room);
  const short = card ? SHORT[card.slug] : undefined;
  let hash = 0;
  for (const ch of room.title) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    card,
    tone: card?.tone ?? TONES[hash % TONES.length],
    audience: short?.audience ?? 'Everyone',
    forWhom: card?.forWhom ?? 'Everyone',
    shortPrep: short?.prep ?? room.prep ?? 'See the booking page for what to bring.',
    prep: room.prep ?? card?.prep ?? 'Nothing to prepare. Just come as you are.',
    description: room.blurb ?? card?.description,
  };
}

export const seatsLeft = (room: Room) => Math.max(room.capacity - room.booked, 0);

/** "Full", "2 seats left", "7 attending" or "Seats open". */
export function seatLabel(room: Room): { text: string; limited: boolean } {
  const left = seatsLeft(room);
  if (left === 0) return { text: 'Full', limited: true };
  if (left <= 3) return { text: `${left} ${left === 1 ? 'seat' : 'seats'} left`, limited: true };
  return { text: room.booked > 0 ? `${room.booked} attending` : 'Seats open', limited: false };
}

/** Can still be booked by someone who has not booked it. */
export const isOpen = (room: Room, now: number) =>
  !room.my_booking_id && seatsLeft(room) > 0 && new Date(room.closes_at).getTime() > now;

// ---------- dates: weeks run Monday to Sunday in Central (the business time zone) ----------

/** YYYY-MM-DD in Central. */
export function centralDay(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ADMIN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function mondayOf(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

/** Midnight at the start of a Central day, as an ISO instant. */
export const centralMidnight = (day: string) => fromCentralInput(`${day}T00:00`) ?? `${day}T06:00:00Z`;

const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const longDay = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const month = new Intl.DateTimeFormat('en-US', { month: 'short' });
const centralTime = new Intl.DateTimeFormat('en-US', { timeZone: ADMIN_TZ, hour: 'numeric', minute: '2-digit' });

/** Local-time pieces for a start time: "Mon", "18", "May", "7:00 PM", "Monday, May 18". */
export function when(iso: string) {
  const at = new Date(iso);
  return {
    weekday: weekday.format(at),
    date: String(at.getDate()),
    month: month.format(at),
    time: time.format(at).toLowerCase(),
    long: longDay.format(at),
    central: `${centralTime.format(at).toLowerCase()} CT`,
  };
}

export const timeOf = (iso: string) => time.format(new Date(iso)).toLowerCase();

export const addMinutes = (iso: string, minutes: number) =>
  new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();

/** The live room opens this long before the start (Kelly 2 Nov: 5) and locks to new arrivals this long after it
 *  (Kelly 6 Nov: 5, was 10). */
export const ROOM_OPENS_MINUTES = 5;
export const ROOM_LOCKS_MINUTES = 5;

/** When the room locks to new arrivals: 5 minutes in, or later while booking stays open (same rule as room_join). */
export function locksAt(room: Pick<Room, 'starts_at' | 'closes_at'>): string {
  const lockIn = addMinutes(room.starts_at, ROOM_LOCKS_MINUTES);
  return new Date(room.closes_at).getTime() > new Date(lockIn).getTime() ? room.closes_at : lockIn;
}

// ---------- loading ----------

export async function fetchRooms(supabase: SupabaseClient, fromDay: string, toDay: string): Promise<Room[] | null> {
  const { data, error } = await supabase.rpc('get_schedule', {
    p_from: centralMidnight(fromDay),
    p_to: centralMidnight(toDay),
  });
  return error ? null : ((data ?? []) as Room[]);
}

/** The signed-in member's seats in sessions that have not ended. */
export async function fetchMine(supabase: SupabaseClient): Promise<Room[] | null> {
  const { data, error } = await supabase.rpc('get_schedule', { p_from: null, p_to: null, p_mine: true });
  return error ? null : ((data ?? []) as Room[]);
}

export type RoomRoleName = 'Starter' | 'Timekeeper' | 'Closer';
export interface RoomRole {
  role: RoomRoleName;
  user_id: string;
}

/** The three room roles (schema section 35), described the way the booking page shows them. */
export const ROOM_ROLES: { role: RoomRoleName; does: string }[] = [
  { role: 'Starter', does: 'Welcomes the room and opens the five-minute check-in.' },
  { role: 'Timekeeper', does: 'Gently signals when focused work and check-out begin.' },
  { role: 'Closer', does: 'Wraps up the room and makes sure everyone gets a final word.' },
];

/** Who holds each role in a session's room. The first call once the room opens hands them out. */
export async function fetchRoles(supabase: SupabaseClient, sessionId: string): Promise<RoomRole[] | null> {
  const { data, error } = await supabase.rpc('room_roles', { p_session: sessionId });
  const res = data as { success?: boolean; roles?: RoomRole[] } | null;
  return error || !res?.success ? null : (res.roles ?? []);
}

export async function fetchRoom(supabase: SupabaseClient, slug: string): Promise<Room | null | undefined> {
  const { data, error } = await supabase.rpc('get_schedule', { p_from: null, p_to: null, p_slug: slug });
  if (error) return undefined;
  return ((data ?? []) as Room[])[0] ?? null;
}
