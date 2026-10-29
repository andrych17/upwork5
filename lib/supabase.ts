import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) {
    return null;
  }
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

export interface UserProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  plan: 'individual' | 'household';
  billing_interval: 'monthly' | 'annual';
  billing_date: number; // Day of the month (1-31)
  monthly_credits: number; // 13 credits per cycle
  addon_credits: number;
  payment_status: 'active' | 'past_due' | 'paused' | 'canceled';
  payment_failed_at: string | null;
  created_at: string;
}

export interface SessionItem {
  id: string;
  title: string;
  blurb: string;
  host: string;
  starts_at: string;
  minutes: number;
  capacity: number;
  booked_count?: number;
}

/** What get_my_membership() returns (supabase/schema.sql, section 14). */
export interface MembershipSummary {
  tier: 'individual' | 'household';
  billing_interval: 'monthly' | 'annual';
  payment_status: 'active' | 'past_due' | 'paused' | 'canceled';
  role: 'individual' | 'owner' | 'member';
  monthly_left: number;
  monthly_total: number;
  addon_left: number;
  week_used: number;
  /** null = no weekly limit */
  week_limit: number | null;
  bhd_left: number;
  bhd_total: number;
  /** YYYY-MM-DD, when the next month's credits arrive */
  next_refill: string;
  household: {
    max_people: number;
    owner_name: string;
    people: { id: string; name: string; email: string | null; is_owner: boolean }[];
    /** pending invite emails, only for the account holder */
    invites: string[] | null;
  } | null;
}

export interface BookingItem {
  id: string;
  session_id: string;
  user_id: string;
  charged_to: string;
  status: 'confirmed' | 'cancelled' | 'late_cancelled' | 'attended';
  created_at: string;
  session?: SessionItem;
}

// Fallback demo state for local browser development when Supabase keys are not yet provided
export const DEMO_USER_STORAGE_KEY = 'mdc_user_session';

export function getDemoUser(): Partial<UserProfile> | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(DEMO_USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setDemoUser(user: Partial<UserProfile> | null) {
  if (typeof window === 'undefined') return;
  if (!user) {
    sessionStorage.removeItem(DEMO_USER_STORAGE_KEY);
  } else {
    sessionStorage.setItem(DEMO_USER_STORAGE_KEY, JSON.stringify(user));
  }
}
