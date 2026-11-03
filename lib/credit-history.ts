// One timeline of what happened to a member's credits (admin member panel). There is no credit ledger table:
// the events come from the records that already exist, so free-trial credits and the monthly reset are not listed.
export interface GrantRow {
  amount: number;
  reason: string;
  created_at: string;
}

export interface PaymentRow {
  kind: 'plan' | 'extras';
  description: string;
  extra_sessions: number | null;
  status: 'paid' | 'refunded';
  refunded_at: string | null;
  refund_reason: string | null;
  created_at: string;
}

export interface BookingRow {
  user_id: string;
  status: string;
  credit_type: 'monthly' | 'addon';
  created_at: string;
  cancelled_at: string | null;
  release_reason: string | null;
  session: { title: string } | null;
  seat: { first_name: string | null; last_name: string | null } | null;
}

export interface CreditEvent {
  at: string;
  label: string;
  detail: string;
  /** +n added, -n used, 0 nothing changed, null no number to show */
  delta: number | null;
}

const join = (...bits: (string | null | undefined | false)[]) => bits.filter(Boolean).join(' · ');

/** Newest first. `ownerId` is whose credits these are, so bookings made by someone else in the Household are labelled. */
export function creditHistory(
  grants: GrantRow[],
  payments: PaymentRow[],
  bookings: BookingRow[],
  ownerId: string,
): CreditEvent[] {
  const events: CreditEvent[] = [];

  for (const g of grants) {
    events.push({ at: g.created_at, label: 'Credits given', detail: g.reason, delta: g.amount });
  }

  for (const p of payments) {
    const extras = p.kind === 'extras';
    events.push({
      at: p.created_at,
      label: extras ? 'Extra sessions bought' : 'Plan payment, monthly credits renewed',
      detail: p.description,
      delta: extras ? p.extra_sessions : null,
    });
    if (p.status === 'refunded' && p.refunded_at) {
      events.push({
        at: p.refunded_at,
        label: 'Payment refunded',
        detail: join(p.description, extras && 'unused extra sessions taken back', p.refund_reason),
        delta: null,
      });
    }
  }

  for (const b of bookings) {
    const title = b.session?.title ?? 'Session';
    const seat =
      b.user_id !== ownerId && b.seat
        ? `for ${`${b.seat.first_name ?? ''} ${b.seat.last_name ?? ''}`.trim() || 'a member'}`
        : '';
    events.push({
      at: b.created_at,
      label: `Booked ${title}`,
      detail: join(b.credit_type === 'addon' ? 'extra credit' : 'monthly credit', seat),
      delta: -1,
    });
    if (b.cancelled_at && b.status === 'cancelled') {
      events.push({
        at: b.cancelled_at,
        label: `Cancelled ${title}`,
        detail: join('credit returned', b.release_reason),
        delta: 1,
      });
    } else if (b.cancelled_at && b.status === 'late_cancelled') {
      events.push({
        at: b.cancelled_at,
        label: `Cancelled ${title}`,
        detail: join('credit kept', b.release_reason),
        delta: 0,
      });
    }
  }

  return events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
