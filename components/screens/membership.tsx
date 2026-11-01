'use client';

// Membership & credits. Plan, status and credit numbers come from get_my_membership() (schema section 14).
// Online payments are not connected yet, so card, receipts and plan changes say so instead of showing
// sample billing. Without Supabase (local preview) the page shows the sample member below.
import AccountMenu from '@/components/account-menu';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import HelloVideoCard from '@/components/hello-video-card';
import HouseholdCard from '@/components/household-card';
import MenuToggle from '@/components/menu-toggle';
import { useAccount } from '@/lib/account';
import { getSupabase, type MembershipSummary } from '@/lib/supabase';

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
};

// Same prices as the sign-up page.
const PRICES = {
  individual: { monthly: 26, annual: 260, name: 'Solo' },
  household: { monthly: 34, annual: 349, name: 'Household' },
} as const;

const STATUS = {
  active: { title: ['Everything’s', 'in good standing.'], label: 'Active membership' },
  past_due: { title: ['Your payment', 'needs a look.'], label: 'Payment didn’t go through' },
  paused: { title: ['Your membership', 'is on pause.'], label: 'Paused' },
  canceled: { title: ['Your membership', 'has ended.'], label: 'Canceled' },
} as const;

const creditOptions = [
  { amount: 1, price: 4, label: 'A little more room' },
  { amount: 5, price: 15, label: 'Keep a few handy' },
];

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
  // Keyed by account id so a sign-in or sign-out in another tab loads again.
  const [loaded, setLoaded] = useState<{ id: string; summary: Summary | null } | null>(null);
  const [selectedCredits, setSelectedCredits] = useState(5);
  const [shopNote, setShopNote] = useState('');
  const selected = creditOptions.find((option) => option.amount === selectedCredits) ?? creditOptions[1];

  const accountId = account?.id ?? '';
  useEffect(() => {
    if (!signedIn && live) return;
    let current = true;
    fetchSummary().then((summary) => {
      if (current) setLoaded({ id: accountId, summary });
    });
    return () => {
      current = false;
    };
  }, [accountId, signedIn, live]);

  const summary = live ? (loaded?.id === accountId ? loaded.summary : undefined) : (loaded?.summary ?? SAMPLE);

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
          live={live}
          selected={selected}
          selectedCredits={selectedCredits}
          onSelect={(amount) => {
            setSelectedCredits(amount);
            setShopNote('');
          }}
          shopNote={shopNote}
          onBuy={() =>
            setShopNote(
              live
                ? 'Buying extra sessions opens once online payments are switched on. Nothing was charged.'
                : `${selected.amount === 1 ? 'One session' : 'Five sessions'} added in this preview.`,
            )
          }
        />
      )}
    </main>
  );
}

interface OverviewProps {
  summary: Summary;
  live: boolean;
  selected: (typeof creditOptions)[number];
  selectedCredits: number;
  onSelect: (amount: number) => void;
  shopNote: string;
  onBuy: () => void;
}

function Overview({ summary: s, live, selected, selectedCredits, onSelect, shopNote, onBuy }: OverviewProps) {
  const plan = PRICES[s.tier];
  const price = s.billing_interval === 'annual' ? plan.annual : plan.monthly;
  const status = STATUS[s.payment_status];
  const isMember = s.role === 'member';
  const weekText = s.week_limit === null ? 'no weekly limit' : `up to ${s.week_limit} per week`;
  const shared = s.tier === 'household' ? ', shared by your household' : '';

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
            <strong>{status.label}</strong>
            <p>
              {s.payment_status === 'past_due'
                ? 'Booking pauses if the payment isn’t fixed within a few days.'
                : `Next monthly sessions arrive ${day(s.next_refill)}.`}
            </p>
          </div>
        </div>
      </section>

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
          {!live && <button type="button">Switch to annual · ${plan.annual}</button>}
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
          {shopNote && (
            <div className="purchase-success" role="status">
              {shopNote}
            </div>
          )}
          <div className="credit-options" role="radiogroup" aria-label="Choose extra sessions">
            {creditOptions.map((option) => (
              <button
                className={selectedCredits === option.amount ? 'selected' : ''}
                type="button"
                role="radio"
                aria-checked={selectedCredits === option.amount}
                key={option.amount}
                onClick={() => onSelect(option.amount)}
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
              <strong>${selected.price}.00</strong>
            </div>
            <button type="button" onClick={onBuy}>
              Add to my account <span aria-hidden="true">→</span>
            </button>
            <p>Charged once. Extra sessions are non-refundable.</p>
          </div>
        </div>
      </section>

      <section className="billing-section">
        <div className="billing-heading">
          <p className="section-label">Billing</p>
          <h2>Your plan, payment, and receipts.</h2>
        </div>
        <div className="billing-grid">
          <article className="payment-method">
            <div>
              <span>Payment method</span>
              <strong>{live ? 'Not connected yet' : 'Visa ···· 4242'}</strong>
              <small>{live ? 'Your card shows here once online payments are switched on.' : 'Expires 08/28'}</small>
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
              ) : (
                <>
                  <strong>
                    ${price} {s.billing_interval === 'annual' ? 'a year' : `on ${day(s.next_refill)}`}
                  </strong>
                  <small>Your membership renews automatically.</small>
                </>
              )}
            </div>
          </article>
        </div>

        {!live && (
          <div className="payment-history">
            <div className="history-heading">
              <strong>Payment history</strong>
              <span>Amount</span>
            </div>
            <div>
              <span>
                <b>May 8, 2026</b> Monthly membership
              </span>
              <strong>$26.00</strong>
              <button type="button">Receipt</button>
            </div>
            <div>
              <span>
                <b>March 24, 2026</b> 5 extra sessions
              </span>
              <strong>$15.00</strong>
              <button type="button">Receipt</button>
            </div>
          </div>
        )}
      </section>

      <section className="manage-membership">
        <div>
          <p className="section-label">Need a change?</p>
          <h2>We hope you’ll stay.</h2>
          <p>
            Your membership keeps running until you decide otherwise. If you cancel, you can keep booking through your
            paid-through date and restart whenever you are ready.
            {live && ' Plan changes and cancellations open here once online payments are switched on.'}
          </p>
        </div>
        <div className="manage-actions">
          <Link className="state-preview-link" href="/states">
            Developer: preview P1 states
          </Link>
          {!live && (
            <>
              <button type="button">Change billing cycle</button>
              <button className="cancel-membership" type="button">
                Cancel membership
              </button>
            </>
          )}
          <Link href="/terms" target="_blank" rel="noreferrer">
            Terms & Conditions <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
    </>
  );
}
