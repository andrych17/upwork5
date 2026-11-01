'use client';

// Membership & credits. Plan, status and credit numbers come from get_my_membership() (schema section 14).
// Payments run in test mode until the processor is connected (sections 23-24): Pay, extra sessions and
// cancel work and leave receipts, but no card is charged. Without Supabase (local preview) the page shows the
// sample member below.
import AccountMenu from '@/components/account-menu';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import HelloVideoCard from '@/components/hello-video-card';
import HouseholdCard from '@/components/household-card';
import MenuToggle from '@/components/menu-toggle';
import { useAccount } from '@/lib/account';
import { EXTRAS, money, PLANS, type Interval, type Tier } from '@/lib/prices';
import { getSupabase, type MembershipSummary, type PaymentRow } from '@/lib/supabase';

type Summary = Pick<
  MembershipSummary,
  | 'tier'
  | 'billing_interval'
  | 'payment_status'
  | 'role'
  | 'monthly_left'
  | 'monthly_total'
  | 'addon_left'
  | 'week_limit'
  | 'week_limit_shared'
  | 'bhd_left'
  | 'bhd_total'
  | 'next_refill'
  | 'test_payments'
  | 'paid_until'
  | 'cancel_at_period_end'
> & { owner_name?: string };

const SAMPLE: Summary = {
  tier: 'individual',
  billing_interval: 'monthly',
  payment_status: 'active',
  role: 'individual',
  monthly_left: 10,
  monthly_total: 13,
  addon_left: 1,
  week_limit: 4,
  week_limit_shared: false,
  bhd_left: 2,
  bhd_total: 3,
  next_refill: '2026-06-08',
  test_payments: true,
  paid_until: '2026-06-08',
  cancel_at_period_end: false,
};

const STATUS = {
  pending: { title: ['Your membership', 'hasn’t started yet.'], label: 'Not started' },
  active: { title: ['Everything’s', 'in good standing.'], label: 'Active membership' },
  past_due: { title: ['Your payment', 'needs a look.'], label: 'Payment didn’t go through' },
  paused: { title: ['Your membership', 'is on pause.'], label: 'Paused' },
  canceled: { title: ['Your membership', 'has ended.'], label: 'Canceled' },
} as const;

type Result = { success: boolean; error?: string; message?: string } | null;

function day(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

async function fetchSummary(): Promise<Summary | null> {
  const supabase = getSupabase();
  if (!supabase) return SAMPLE;
  const { data, error } = await supabase.rpc('get_my_membership');
  const s = data as MembershipSummary | null;
  if (error || !s) return null;
  return { ...s, owner_name: s.household?.owner_name };
}

const SAMPLE_PAYMENTS: PaymentRow[] = [
  {
    id: 's1',
    profile_id: '',
    kind: 'plan',
    description: 'Solo membership, monthly',
    amount_cents: 2600,
    provider: 'test',
    status: 'paid',
    refunded_at: null,
    refund_reason: null,
    created_at: '2026-05-08T15:00:00Z',
  },
  {
    id: 's2',
    profile_id: '',
    kind: 'extras',
    description: '5 extra sessions',
    amount_cents: 1500,
    provider: 'test',
    status: 'paid',
    refunded_at: null,
    refund_reason: null,
    created_at: '2026-03-24T15:00:00Z',
  },
];

async function fetchPayments(): Promise<PaymentRow[]> {
  const supabase = getSupabase();
  if (!supabase) return SAMPLE_PAYMENTS;
  const { data } = await supabase
    .from('payments')
    .select('id, profile_id, kind, description, amount_cents, provider, status, refunded_at, refund_reason, created_at')
    .order('created_at', { ascending: false })
    .limit(24);
  return (data ?? []) as PaymentRow[];
}

/** Calls a billing RPC and returns its message, or throws the error text. */
async function billing(fn: string, args: Record<string, unknown>): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) return 'Done in this preview.';
  const { data, error } = await supabase.rpc(fn, args);
  const res = data as Result;
  if (error || !res?.success) throw new Error(res?.error || 'That didn’t go through. Please try again.');
  return res.message ?? '';
}

function Pips({ left, total, tone }: { left: number; total: number; tone?: 'yellow' }) {
  if (total <= 0) return null;
  return (
    <div
      className={tone ? `large-pips ${tone}` : 'large-pips'}
      style={{ gridTemplateColumns: `repeat(${total}, 1fr)`, gap: total > 6 ? 3 : 5 }}
      aria-hidden="true"
    >
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i < left ? undefined : 'empty'} />
      ))}
    </div>
  );
}

export default function MembershipPage() {
  const live = Boolean(getSupabase());
  const { ready, account } = useAccount();
  const signedIn = Boolean(account);
  // Keyed by account id (and a reload counter) so a sign-in elsewhere or a payment loads again.
  const [tick, setTick] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; summary: Summary | null; payments: PaymentRow[] } | null>(null);

  const key = `${account?.id ?? ''}|${tick}`;
  useEffect(() => {
    if (!signedIn && live) return;
    let current = true;
    Promise.all([fetchSummary(), fetchPayments()]).then(([summary, payments]) => {
      if (current) setLoaded({ key, summary, payments });
    });
    return () => {
      current = false;
    };
  }, [key, signedIn, live]);

  // While a change reloads, keep showing the last numbers for the same person.
  const mine = loaded && loaded.key.split('|')[0] === (account?.id ?? '') ? loaded : null;
  const summary = live ? (mine ? mine.summary : undefined) : (loaded?.summary ?? SAMPLE);

  return (
    <main className="membership-page">
      <header className="schedule-nav member-nav">
        <Link className="schedule-mark" href="/" aria-label="MeetDoConnect home">
          <span>Meet</span>
          <span>Do</span>
          <span>Connect</span>
        </Link>
        <nav aria-label="Member navigation">
          <Link href="/calendar">Calendar</Link>
          <Link href="/sessions">My sessions</Link>
          <Link className="active" href="/membership">
            Membership
          </Link>
        </nav>
        <AccountMenu
          signedOut={
            <Link className="schedule-signin" href="/signin">
              Sign in
            </Link>
          }
        />
        <MenuToggle />
      </header>

      {live && ready && !signedIn ? (
        <section className="membership-page-hero">
          <div>
            <p className="section-label">Membership & credits</p>
            <h1>
              Sign in to see
              <br />
              <span>your membership.</span>
            </h1>
          </div>
          <div className="manage-actions">
            <Link className="state-preview-link" href="/signin">
              Sign in
            </Link>
            <Link href="/signup">Join MeetDoConnect</Link>
          </div>
        </section>
      ) : summary === undefined ? (
        <section className="membership-page-hero" aria-busy="true">
          <div>
            <p className="section-label">Membership & credits</p>
            <h1>Loading your membership…</h1>
          </div>
        </section>
      ) : summary === null ? (
        <section className="membership-page-hero">
          <div>
            <p className="section-label">Membership & credits</p>
            <h1>We couldn’t load your membership.</h1>
            <p>Refresh the page to try again.</p>
          </div>
        </section>
      ) : (
        <Overview
          summary={summary}
          payments={(live ? mine?.payments : loaded?.payments) ?? []}
          live={live}
          reload={() => setTick((t) => t + 1)}
        />
      )}
    </main>
  );
}

interface OverviewProps {
  summary: Summary;
  payments: PaymentRow[];
  live: boolean;
  reload: () => void;
}

function Overview({ summary: s, payments, live, reload }: OverviewProps) {
  const plan = PLANS[s.tier];
  const price = s.billing_interval === 'annual' ? plan.annual : plan.monthly;
  const status = STATUS[s.payment_status];
  const isMember = s.role === 'member';
  const running = s.payment_status === 'active';
  const weekText = s.week_limit === null ? 'no weekly limit' : `up to ${s.week_limit} per week`;
  const shared = s.tier === 'household' ? ', shared by your household' : '';
  const nextDay = s.paid_until ?? s.next_refill;

  const [selectedCredits, setSelectedCredits] = useState(5);
  const selected = EXTRAS.find((option) => option.amount === selectedCredits) ?? EXTRAS[1];
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState<{ where: 'shop' | 'plan' | 'manage'; text: string; error?: boolean } | null>(null);
  const [newTier, setNewTier] = useState<Tier>(s.tier);
  const [newInterval, setNewInterval] = useState<Interval>(s.billing_interval);

  const act = async (where: 'shop' | 'plan' | 'manage', fn: string, args: Record<string, unknown>, done: string) => {
    setBusy(where);
    setNote(null);
    try {
      const message = await billing(fn, args);
      setNote({ where, text: message || done });
      reload();
    } catch (e) {
      setNote({ where, text: e instanceof Error ? e.message : String(e), error: true });
    }
    setBusy('');
  };

  const noteFor = (where: 'shop' | 'plan' | 'manage') =>
    note?.where === where && (
      <div className={note.error ? 'purchase-success purchase-error' : 'purchase-success'} role="status">
        {note.text}
      </div>
    );

  return (
    <>
      <section className="membership-page-hero">
        <div>
          <p className="section-label">Membership & credits</p>
          <h1>
            {status.title[0]}
            <br />
            <span>{status.title[1]}</span>
          </h1>
        </div>
        <div className="active-status" data-status={s.payment_status}>
          <span className="active-status-dot" />
          <div>
            <strong>{s.cancel_at_period_end && running ? 'Ends soon' : status.label}</strong>
            <p>
              {s.payment_status === 'past_due'
                ? 'Booking pauses if the payment isn’t fixed within a few days.'
                : s.payment_status === 'pending'
                  ? 'Choose a plan below to start booking.'
                  : !running
                    ? 'Restart below whenever you’re ready.'
                    : s.cancel_at_period_end
                      ? `Your membership ends ${day(nextDay)}.`
                      : `Next monthly sessions arrive ${day(s.next_refill)}.`}
            </p>
          </div>
        </div>
      </section>

      {!running && !isMember && (
        <section className="buy-credits start-plan" id="plan">
          <div className="buy-copy">
            <p className="section-label">
              {s.payment_status === 'pending' ? 'Start your membership' : 'Pick up again'}
            </p>
            <h2>
              {s.payment_status === 'past_due' || s.payment_status === 'paused' ? (
                <>
                  Settle the payment,
                  <br />
                  keep your seats.
                </>
              ) : (
                <>
                  Choose a plan,
                  <br />
                  start booking today.
                </>
              )}
            </h2>
            <p>
              Your month starts on the day you pay, and the plan’s sessions arrive right away.
              {s.test_payments && ' Payments are in test mode: nothing is charged.'}
            </p>
          </div>
          <div className="credit-shop">
            {noteFor('plan')}
            <div className="credit-options" role="radiogroup" aria-label="Plan">
              {(Object.keys(PLANS) as Tier[]).flatMap((t) =>
                (['monthly', 'annual'] as Interval[]).map((i) => (
                  <button
                    className={newTier === t && newInterval === i ? 'selected' : ''}
                    type="button"
                    role="radio"
                    aria-checked={newTier === t && newInterval === i}
                    key={`${t}-${i}`}
                    onClick={() => {
                      setNewTier(t);
                      setNewInterval(i);
                    }}
                  >
                    <span>{i === 'annual' ? 'Annual' : 'Monthly'}</span>
                    <strong>{PLANS[t].name}</strong>
                    <small>{PLANS[t].credits} sessions a month</small>
                    <b>${PLANS[t][i]}</b>
                  </button>
                )),
              )}
            </div>
            <div className="purchase-total">
              <div>
                <span>
                  {PLANS[newTier].name}, {newInterval}
                </span>
                <strong>{money(PLANS[newTier][newInterval] * 100)}</strong>
              </div>
              <button
                type="button"
                disabled={busy !== ''}
                onClick={() =>
                  void act(
                    'plan',
                    'test_checkout',
                    { p_tier: newTier, p_interval: newInterval },
                    'Paid. Your membership is active and your sessions are ready.',
                  )
                }
              >
                {busy === 'plan' ? 'Paying…' : `Pay ${money(PLANS[newTier][newInterval] * 100)}`}{' '}
                <span aria-hidden="true">→</span>
              </button>
              <p>
                {s.test_payments
                  ? 'Test mode: no card is charged. A receipt appears below.'
                  : 'Renews automatically. Cancel anytime.'}
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="membership-overview">
        <article className="current-plan">
          <div className="plan-topline">
            <p className="section-label">Your plan</p>
            <span>{s.billing_interval === 'annual' ? 'Annual' : 'Monthly'}</span>
          </div>
          {isMember ? (
            <div className="plan-price">
              <strong>{plan.name}</strong>
              <span>{s.owner_name ? `paid by ${s.owner_name}` : 'paid by your account holder'}</span>
            </div>
          ) : (
            <div className="plan-price">
              <strong>${price}</strong>
              <span>
                / {s.billing_interval === 'annual' ? 'year' : 'month'} ({plan.name})
              </span>
            </div>
          )}
          <p>
            {s.monthly_total} live sessions per month{shared}, {weekText}. Resets on your billing date.
          </p>
          <div className="plan-includes">
            <span>
              {s.monthly_total} monthly sessions (
              {s.week_limit === null ? 'no weekly limit' : `up to ${s.week_limit}/week`})
            </span>
            <span>{s.bhd_total} Bad Hair Day cards monthly</span>
            <span>Activity buddy picks</span>
            <span>Member-only rooms</span>
          </div>
        </article>

        <div className="credit-overview">
          <article>
            <span>Monthly sessions</span>
            <strong>
              {s.monthly_left} <small>of {s.monthly_total} left</small>
            </strong>
            <Pips left={s.monthly_left} total={s.monthly_total} />
            <p>
              Resets {day(s.next_refill)}
              {s.week_limit === null ? '' : ` · max ${s.week_limit}/week`}
              {s.week_limit_shared ? ' (shared)' : ''}
            </p>
          </article>
          <article>
            <span>Extra sessions</span>
            <strong>
              {s.addon_left} <small>available</small>
            </strong>
            <div className="extra-credit-icon" aria-hidden="true">
              +
            </div>
            <p>Extras never expire</p>
          </article>
          <article>
            <span>Bad Hair Day cards</span>
            <strong>
              {s.bhd_left} <small>of {s.bhd_total} left</small>
            </strong>
            <Pips left={s.bhd_left} total={s.bhd_total} tone="yellow" />
            <p>Resets on the 1st of each month</p>
          </article>
        </div>
      </section>

      <HouseholdCard />

      <HelloVideoCard />

      {(running || isMember) && (
        <section className="buy-credits" id="credits">
          <div className="buy-copy">
            <p className="section-label">Want another session?</p>
            <h2>
              Keep an extra
              <br />
              hour in your pocket.
            </h2>
            <p>
              Extra sessions are used after your monthly sessions, or once you reach the weekly limit. They never expire
              and stay with your account until you need them.
            </p>
          </div>
          <div className="credit-shop">
            {noteFor('shop')}
            <div className="credit-options" role="radiogroup" aria-label="Choose extra sessions">
              {EXTRAS.map((option) => (
                <button
                  className={selectedCredits === option.amount ? 'selected' : ''}
                  type="button"
                  role="radio"
                  aria-checked={selectedCredits === option.amount}
                  key={option.amount}
                  onClick={() => {
                    setSelectedCredits(option.amount);
                    setNote(null);
                  }}
                >
                  <span>{option.label}</span>
                  <strong>{option.amount}</strong>
                  <small>{option.amount === 1 ? 'extra session' : 'extra sessions'}</small>
                  <b>${option.price}</b>
                </button>
              ))}
            </div>
            <div className="purchase-total">
              <div>
                <span>
                  {selected.amount} extra {selected.amount === 1 ? 'session' : 'sessions'}
                </span>
                <strong>{money(selected.price * 100)}</strong>
              </div>
              <button
                type="button"
                disabled={busy !== ''}
                onClick={() =>
                  void act(
                    'shop',
                    'test_buy_extras',
                    { p_count: selected.amount },
                    `${selected.amount === 1 ? 'One extra session' : `${selected.amount} extra sessions`} added to your account.`,
                  )
                }
              >
                {busy === 'shop' ? 'Adding…' : 'Add to my account'} <span aria-hidden="true">→</span>
              </button>
              <p>
                Charged once. Extra sessions are non-refundable.
                {s.test_payments && ' Test mode: no card is charged.'}
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="billing-section">
        <div className="billing-heading">
          <p className="section-label">Billing</p>
          <h2>Your plan, payment, and receipts.</h2>
        </div>
        <div className="billing-grid">
          <article className="payment-method">
            <div>
              <span>Payment method</span>
              <strong>{!live ? 'Visa ···· 4242' : s.test_payments ? 'Test mode' : 'Card on file'}</strong>
              <small>
                {!live
                  ? 'Expires 08/28'
                  : s.test_payments
                    ? 'Card payments are being connected. Nothing is charged for now.'
                    : 'Managed by our payment processor.'}
              </small>
            </div>
          </article>
          <article className="next-payment">
            <div>
              <span>Next payment</span>
              {isMember ? (
                <>
                  <strong>Covered by your household</strong>
                  <small>{s.owner_name ?? 'Your account holder'} pays for the plan.</small>
                </>
              ) : !running ? (
                <>
                  <strong>None scheduled</strong>
                  <small>Start or restart your membership above.</small>
                </>
              ) : s.cancel_at_period_end ? (
                <>
                  <strong>None, ends {day(nextDay)}</strong>
                  <small>You can keep booking until then.</small>
                </>
              ) : (
                <>
                  <strong>
                    ${price} on {day(nextDay)}
                  </strong>
                  <small>Your membership renews automatically.</small>
                </>
              )}
            </div>
          </article>
        </div>

        <div className="payment-history">
          <div className="history-heading">
            <strong>Payment history</strong>
            <span>Amount</span>
          </div>
          {payments.length === 0 && (
            <div>
              <span>No payments yet.</span>
            </div>
          )}
          {payments.map((p) => (
            <div key={p.id}>
              <span>
                <b>
                  {new Date(p.created_at).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </b>{' '}
                {p.description}
                {p.provider === 'test' && <em className="test-badge">Test</em>}
              </span>
              <strong className={p.status === 'refunded' ? 'refunded' : undefined}>{money(p.amount_cents)}</strong>
              <span className="receipt-status">{p.status === 'refunded' ? 'Refunded' : 'Paid'}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="manage-membership">
        <div>
          <p className="section-label">Need a change?</p>
          <h2>We hope you’ll stay.</h2>
          <p>
            Your membership keeps running until you decide otherwise. If you cancel, you can keep booking through your
            paid-through date and restart whenever you are ready.
          </p>
          {noteFor('manage')}
        </div>
        <div className="manage-actions">
          {!live && (
            <Link className="state-preview-link" href="/states">
              Developer: preview P1 states
            </Link>
          )}
          {running && !isMember && (
            <button
              className={s.cancel_at_period_end ? undefined : 'cancel-membership'}
              type="button"
              disabled={busy !== ''}
              onClick={() => {
                if (
                  !s.cancel_at_period_end &&
                  !window.confirm(`Cancel your membership? It runs until ${day(nextDay)}.`)
                )
                  return;
                void act('manage', 'cancel_membership', { p_cancel: !s.cancel_at_period_end }, 'Saved.');
              }}
            >
              {busy === 'manage' ? 'Saving…' : s.cancel_at_period_end ? 'Keep my membership' : 'Cancel membership'}
            </button>
          )}
          <Link href="/terms" target="_blank" rel="noopener noreferrer">
            Terms & Conditions <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
    </>
  );
}
