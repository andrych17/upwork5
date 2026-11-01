// Shared bits for the admin screens (/admin/*). Every write goes through an admin_* RPC in
// supabase/schema.sql (sections 18 and 21); the database checks is_admin() on each call.
import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { parts, zonedToUtc } from '@/lib/schedule/rules';

/** app_config.tz. Sessions are planned in Central time. */
export const ADMIN_TZ = 'America/Chicago';
export const PAGE_SIZE = 25;

export type PaymentStatus = 'active' | 'past_due' | 'paused' | 'canceled';
export type Tier = 'individual' | 'household';
export type BillingInterval = 'monthly' | 'annual';

export interface AdminProfile {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  tier: Tier;
  billing_interval: BillingInterval;
  billing_date: number;
  monthly_credits: number;
  addon_credits: number;
  payment_status: PaymentStatus;
  payment_failed_at: string | null;
  is_admin: boolean;
  disabled_at: string | null;
  household_owner_id: string | null;
  hello_status: string;
  created_at: string;
}

export const PROFILE_COLUMNS =
  'id,email,first_name,last_name,tier,billing_interval,billing_date,monthly_credits,addon_credits,' +
  'payment_status,payment_failed_at,is_admin,disabled_at,household_owner_id,hello_status,created_at';

export interface RpcResult {
  ok: boolean;
  error: string;
  data: Record<string, unknown>;
}

/** Calls an admin RPC that answers { success, error?, ... }. */
export async function adminRpc(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<RpcResult> {
  const { data, error } = await supabase.rpc(fn, args);
  const res = (data ?? {}) as Record<string, unknown>;
  if (error) return { ok: false, error: 'The request failed. Please try again.', data: res };
  if (res.success !== true) {
    return { ok: false, error: typeof res.error === 'string' ? res.error : 'Something went wrong.', data: res };
  }
  return { ok: true, error: '', data: res };
}

export const fullName = (p: { first_name?: string | null; last_name?: string | null; email?: string | null }) =>
  `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email || 'Member';

const dateTime = new Intl.DateTimeFormat('en-US', {
  timeZone: ADMIN_TZ,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const dateOnly = new Intl.DateTimeFormat('en-US', {
  timeZone: ADMIN_TZ,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** "Tue, Nov 3, 6:30 PM CT" */
export const fmtWhen = (iso: string | null | undefined) => (iso ? `${dateTime.format(new Date(iso))} CT` : '');
export const fmtDate = (iso: string | null | undefined) => (iso ? dateOnly.format(new Date(iso)) : '');

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO instant to the value of an <input type="datetime-local">, in Central time. */
export function toCentralInput(iso: string): string {
  const p = parts(new Date(iso).getTime(), ADMIN_TZ);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.hh)}:${pad(p.mm)}`;
}

/** <input type="datetime-local"> value read as Central time, to an ISO instant. Null if invalid. */
export function fromCentralInput(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m.map(Number) as [number, number, number, number, number, number];
  return new Date(zonedToUtc(y, mo, d, hh, mm, ADMIN_TZ)).toISOString();
}

/** Strips characters that would break a PostgREST or() filter. */
export const searchTerm = (q: string) => q.replace(/[,()*%\\:"']/g, ' ').trim().slice(0, 80);

export const STATUS_LABEL: Record<PaymentStatus, string> = {
  active: 'Active',
  past_due: 'Past due',
  paused: 'Paused',
  canceled: 'Canceled',
};

export const statusBadge = (s: PaymentStatus) =>
  s === 'active' ? 'adm-badge adm-badge-good' : s === 'past_due' ? 'adm-badge adm-badge-warn' : 'adm-badge adm-badge-bad';

/**
 * Runs `load` (a useCallback) whenever it changes or reload() is called. Only the newest answer is kept,
 * so a slow old query can't overwrite a newer one. `loading` is true until the current query answers.
 * Loaders resolve with their own error field instead of throwing.
 */
export function useLoad<T>(load: () => PromiseLike<T>): { data: T | undefined; loading: boolean; reload: () => void } {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{ load: () => PromiseLike<T>; tick: number; data: T } | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.resolve(load()).then((data) => {
      if (live) setState({ load, tick, data });
    });
    return () => {
      live = false;
    };
  }, [load, tick]);
  return {
    data: state?.data,
    loading: state?.load !== load || state?.tick !== tick,
    reload: () => setTick((t) => t + 1),
  };
}
