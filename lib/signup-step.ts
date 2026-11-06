// Where an unfinished sign-up picks up again. Used by the sign-up page (resume) and the sign-in page (send
// people who stopped before the plan back to sign-up instead of the calendar). Tested by scripts/test-signup.ts.
import type { MembershipSummary } from './supabase';

type Progress = Pick<MembershipSummary, 'terms_accepted' | 'role' | 'payment_status' | 'hello_status'>;

/** The first sign-up step this person has not finished: 2 Terms, 3 plan, 4 Hello Video, 5 the rest. */
export function resumeStep(s: Progress | null): number {
  if (!s?.terms_accepted) return 2;
  if (s.role !== 'member' && s.payment_status === 'pending') return 3;
  if (s.hello_status === 'none' || s.hello_status === 'rejected') return 4;
  return 5;
}

/**
 * True when sign-in should go back to sign-up: the Terms or the plan are still open. A Hello Video left for
 * "later" doesn't count, so those members aren't sent back through sign-up every time they sign in.
 */
export function mustFinishSignup(s: Progress | null): boolean {
  return s !== null && resumeStep(s) < 4;
}
