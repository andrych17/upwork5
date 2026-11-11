'use client';

// The wait between auth emails (password reset, a new sign-up code). Supabase already allows one email a minute
// per address (auth.email.max_frequency) and a cap per hour for the whole project (auth.rate_limit.email_sent);
// this only keeps the buttons from asking sooner than that.
import { useEffect, useState } from 'react';

export const EMAIL_WAIT_SECONDS = 60;

/** Seconds left before the next email can be asked for. start() begins the wait. */
export function useEmailWait(seconds: number = EMAIL_WAIT_SECONDS): { left: number; start: () => void } {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  return { left, start: () => setLeft(seconds) };
}

/** Supabase's "too many emails" answer: an email went to this address less than a minute ago, or the hourly cap. */
export function isEmailRateLimit(error: { status?: number; code?: string } | null | undefined): boolean {
  return Boolean(error && (error.status === 429 || error.code === 'over_email_send_rate_limit'));
}
