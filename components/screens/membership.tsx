'use client';

import Link from 'next/link';
import { useState } from 'react';
import MenuToggle from '@/components/menu-toggle';

const creditOptions = [
  { amount: 1, price: 4, label: 'A little more room' },
  { amount: 3, price: 12, label: 'A full extra week' },
  { amount: 5, price: 20, label: 'Keep a few handy' },
];

export default function MembershipPage() {
  const [selectedCredits, setSelectedCredits] = useState(3);
  const [purchased, setPurchased] = useState(false);
  const selected = creditOptions.find((option) => option.amount === selectedCredits) ?? creditOptions[1];

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
        <Link className="member-avatar" href="/membership" aria-label="Open account">
          KC
        </Link>
        <MenuToggle />
      </header>

      <section className="membership-page-hero">
        <div>
          <p className="section-label">Membership & credits</p>
          <h1>
            Everything’s
            <br />
            <span>in good standing.</span>
          </h1>
        </div>
        <div className="active-status">
          <span className="active-status-dot" />
          <div>
            <strong>Active membership</strong>
            <p>Paid through June 8, 2026</p>
          </div>
        </div>
      </section>

      <section className="membership-overview">
        <article className="current-plan">
          <div className="plan-topline">
            <p className="section-label">Your plan</p>
            <span>Monthly</span>
          </div>
          <div className="plan-price">
            <strong>$24</strong>
            <span>/ month</span>
          </div>
          <p>Three live sessions every week, resetting each Monday. Cancel any time.</p>
          <div className="plan-includes">
            <span>3 weekly sessions</span>
            <span>3 Bad Hair Day cards monthly</span>
            <span>Activity buddy picks</span>
            <span>Member-only rooms</span>
          </div>
          <button type="button">Switch to annual · $240</button>
        </article>

        <div className="credit-overview">
          <article>
            <span>Weekly sessions</span>
            <strong>
              2 <small>of 3 left</small>
            </strong>
            <div className="large-pips" aria-label="Two of three weekly sessions remaining">
              <i />
              <i />
              <i className="empty" />
            </div>
            <p>Resets Monday, May 25</p>
          </article>
          <article>
            <span>Extra sessions</span>
            <strong>
              {purchased ? 4 : 1} <small>available</small>
            </strong>
            <div className="extra-credit-icon" aria-hidden="true">
              +
            </div>
            <p>Extras never expire</p>
          </article>
          <article>
            <span>Bad Hair Day cards</span>
            <strong>
              2 <small>of 3 left</small>
            </strong>
            <div className="large-pips yellow" aria-label="Two of three Bad Hair Day cards remaining">
              <i />
              <i />
              <i className="empty" />
            </div>
            <p>Resets June 1</p>
          </article>
        </div>
      </section>

      <section className="buy-credits" id="credits">
        <div className="buy-copy">
          <p className="section-label">Want another session?</p>
          <h2>
            Keep an extra
            <br />
            hour in your pocket.
          </h2>
          <p>
            Extra sessions are used only after your three weekly sessions. They never expire and stay with your account
            until you need them.
          </p>
        </div>
        <div className="credit-shop">
          {purchased && (
            <div className="purchase-success" role="status">
              <strong>Three sessions added.</strong>
              Your new balance is 4 extra sessions.
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
                onClick={() => {
                  setSelectedCredits(option.amount);
                  setPurchased(false);
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
              <strong>${selected.price}.00</strong>
            </div>
            <button type="button" onClick={() => setPurchased(true)}>
              Add to my account <span aria-hidden="true">→</span>
            </button>
            <p>Charged once to Visa ending in 4242. Extra sessions are non-refundable.</p>
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
              <strong>Visa ···· 4242</strong>
              <small>Expires 08/28</small>
            </div>
            <button type="button">Update card</button>
          </article>
          <article className="next-payment">
            <div>
              <span>Next payment</span>
              <strong>$24 on June 8</strong>
              <small>Your membership renews automatically.</small>
            </div>
            <button type="button">View receipt settings</button>
          </article>
        </div>

        <div className="payment-history">
          <div className="history-heading">
            <strong>Payment history</strong>
            <span>Amount</span>
          </div>
          <div>
            <span>
              <b>May 8, 2026</b> Monthly membership
            </span>
            <strong>$24.00</strong>
            <button type="button">Receipt</button>
          </div>
          <div>
            <span>
              <b>April 8, 2026</b> Monthly membership
            </span>
            <strong>$24.00</strong>
            <button type="button">Receipt</button>
          </div>
          <div>
            <span>
              <b>March 24, 2026</b> 3 extra sessions
            </span>
            <strong>$12.00</strong>
            <button type="button">Receipt</button>
          </div>
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
        </div>
        <div className="manage-actions">
          <Link className="state-preview-link" href="/states">
            Developer: preview P1 states
          </Link>
          <button type="button">Change billing cycle</button>
          <button className="cancel-membership" type="button">
            Cancel membership
          </button>
          <Link href="/terms" target="_blank" rel="noreferrer">
            Terms & Conditions <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
