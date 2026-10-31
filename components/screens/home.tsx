'use client';

import Link from 'next/link';
import { useState } from 'react';
import { prepCards, type SessionContent } from '@/lib/session-data';
import MenuToggle from '@/components/menu-toggle';

const photos = [
  { src: '/images/guitar-duo.webp', alt: 'Two people sharing music with a guitar and tablet' },
  { src: '/images/dad-child-baking.webp', alt: 'A dad and child baking together' },
  { src: '/images/girl-glasses-guitar.webp', alt: 'A young woman with glasses playing guitar outdoors' },
  { src: '/images/guy-chair.webp', alt: 'A man smiling while seated in front of a home library' },
  { src: '/images/gma-granddaughter-cooking.webp', alt: 'A grandmother and granddaughter cooking together' },
];

function PrepCardView({ card, index }: { card: SessionContent; index: number }) {
  const [flipped, setFlipped] = useState(false);
  const cardId = `prep-card-${index}`;

  return (
    <button
      className={`prep-card ${flipped ? 'is-flipped' : ''}`}
      type="button"
      aria-expanded={flipped}
      aria-controls={cardId}
      onClick={() => setFlipped((current) => !current)}
    >
      <span className="prep-card-inner">
        <span className={`prep-face prep-front tone-${card.tone}`}>
          <span className="card-number">{String(index + 1).padStart(2, '0')}</span>
          <span className="card-kicker">60 minutes · 1 credit</span>
          <span className="card-title">{card.title}</span>
          <span className="card-for">
            <strong>Who it’s for</strong>
            {card.forWhom}
          </span>
          <span className="flip-prompt">
            Flip for the plan <span aria-hidden="true">↗</span>
          </span>
        </span>
        <span className={`prep-face prep-back tone-${card.tone}`} id={cardId}>
          <span className="back-title">{card.title}</span>
          <span className="detail-block">
            <strong>Bring this</strong>
            <span>{card.prep}</span>
          </span>
          <span className="detail-block">
            <strong>How it flows</strong>
            <span>{card.run}</span>
          </span>
          {card.ideas && (
            <span className="detail-block">
              <strong>Ideas & prompts</strong>
              <span>{card.ideas.join(' · ')}</span>
            </span>
          )}
          {card.note && <span className="safety-note">{card.note}</span>}
          <span className="flip-prompt">
            Back to front <span aria-hidden="true">↙</span>
          </span>
        </span>
      </span>
    </button>
  );
}

function CardRow({ start }: { start: number }) {
  return (
    <div className="prep-grid">
      {prepCards.slice(start, start + 4).map((card, offset) => (
        <PrepCardView card={card} index={start + offset} key={card.title} />
      ))}
    </div>
  );
}

interface MembershipCardProps {
  label: string;
  price: string;
  detail: string;
  accent: string;
  /** Plan name for the join link, e.g. "Solo monthly". */
  plan: string;
  /** Third joining step, which differs between Solo and Household. */
  step: string;
}

function MembershipCard({ label, price, detail, accent, plan, step }: MembershipCardProps) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className={`membership-card ${accent} ${flipped ? 'is-flipped' : ''}`}>
      <span className="membership-inner">
        <span className="membership-face membership-front">
          <span className="membership-label">{label}</span>
          <span className="membership-price">{price}</span>
          <span className="membership-detail">{detail}</span>
          <button className="membership-action" type="button" aria-expanded={flipped} onClick={() => setFlipped(true)}>
            See how joining works <span aria-hidden="true">↗</span>
          </button>
        </span>
        <span className="membership-face membership-back">
          <span className="membership-label">Three simple steps</span>
          <span className="join-step">
            <strong>01</strong> Read and accept the short community rules.
          </span>
          <span className="join-step">
            <strong>02</strong> Record a quick Hello Video, seen only by our admin.
          </span>
          <span className="join-step">
            <strong>03</strong> {step}
          </span>
          <Link className="plan-join" href="/signup">
            Join with {plan} <span aria-hidden="true">→</span>
          </Link>
          <Link className="terms-link" href="/terms" target="_blank" rel="noreferrer">
            Read Terms & Conditions <span aria-hidden="true">↗</span>
          </Link>
          <button className="membership-action" type="button" onClick={() => setFlipped(false)}>
            Back to plan <span aria-hidden="true">↙</span>
          </button>
        </span>
      </span>
    </div>
  );
}

const SOLO_STEP = 'Choose your plan, then book up to 13 sessions a month (up to four a week).';
const HOUSEHOLD_STEP =
  'Choose Household and invite up to 3 people by email. You share 16 sessions a month: 4 each week, shared between household members.';

export default function Home() {
  return (
    <main>
      <section className="hero" aria-label="MeetDoConnect introduction">
        <div className="hero-collage" aria-hidden="true">
          {photos.map((photo, index) => (
            <div className={`photo photo-${index + 1}`} key={photo.src}>
              <img src={photo.src} alt="" />
            </div>
          ))}
        </div>
        <div className="hero-scrim" />
        <header className="site-header">
          <Link className="mini-mark" href="/" aria-label="MeetDoConnect home">
            MDC
          </Link>
          <nav aria-label="Primary navigation">
            <Link href="/">Home</Link>
            <Link href="/calendar">Calendar</Link>
            <Link href="/games">Games</Link>
            <Link href="/membership">Membership</Link>
            <Link href="/signin">Sign in</Link>
          </nav>
          <Link className="sign-in" href="/signup">
            Join
          </Link>
          <MenuToggle />
        </header>
        <div className="hero-copy" id="top">
          <p className="eyebrow">Real people. Real activities. Live online.</p>
          <h1>
            <span>Meet</span>
            <span>Do</span>
            <span>Connect</span>
          </h1>
          <p className="tagline">Skip the swiping. Start doing.</p>
        </div>
        <a className="hero-cta" href="#rooms">
          Find something to do <span aria-hidden="true">↓</span>
        </a>
      </section>

      <section className="purpose">
        <div className="purpose-copy">
          <p className="section-label">A better kind of online</p>
          <h2>Show up as you are. Leave with something done.</h2>
          <div className="purpose-text">
            <p>
              MeetDoConnect brings solo people, couples, teens, and families into welcoming video rooms built around
              doing—not performing.
            </p>
            <p>
              Make dinner. Finish the puzzle. Write the page. Share a song. The activity breaks the ice; the people make
              it matter.
            </p>
          </div>
          <div className="join-actions">
            <Link className="join-button" href="/signup">
              Join MeetDoConnect <span aria-hidden="true">↗</span>
            </Link>
            <Link className="join-toc" href="/terms" target="_blank" rel="noreferrer">
              Terms & Conditions
            </Link>
          </div>
        </div>
        <div className="purpose-collage" aria-label="People connecting through shared activities">
          <img
            loading="lazy"
            decoding="async"
            src="/images/community-painting.webp"
            alt="A woman smiling while painting"
          />
          <img
            loading="lazy"
            decoding="async"
            src="/images/community-crafting.webp"
            alt="A man concentrating on a hands-on craft project"
          />
          <span className="collage-note">Come alone. Do it together.</span>
        </div>
      </section>

      <section className="rooms" id="rooms">
        <div className="rooms-heading">
          <div>
            <p className="section-label">Explore rooms</p>
            <h2>Twelve ways to spend an hour together.</h2>
          </div>
          <p className="rooms-note">Hover, tap, or press a card to reveal what to bring and how the hour flows.</p>
        </div>
        <CardRow start={0} />
        <CardRow start={4} />
      </section>

      <section className="manifesto">
        <p>MeetDoConnect</p>
        <h2>
          Skip the swiping.
          <br />
          <span>Start doing.</span>
        </h2>
        <div className="manifesto-track" aria-hidden="true">
          MAKE · THINK · PLAY · COOK · WRITE · LISTEN · MAKE · THINK · PLAY · COOK
        </div>
      </section>

      <section className="rooms rooms-final" aria-label="More rooms">
        <CardRow start={8} />
      </section>

      <section className="how-it-works">
        <div className="how-copy">
          <p className="section-label">Real people. Real connection.</p>
          <h2>How our community works.</h2>
          <div className="steps">
            <div>
              <span>01</span>
              <p>
                <strong>Choose</strong> an activity and book with one session credit. Plans include 3 or 4 credits per
                week, add-on credits available when needed.
              </p>
            </div>
            <div>
              <span>02</span>
              <p>
                <strong>Prepare</strong> with a simple card that tells you exactly what to bring.
              </p>
            </div>
            <div>
              <span>03</span>
              <p>
                <strong>Do</strong> the activity live in a small video room of about 5–12 people.
              </p>
            </div>
            <div>
              <span>04</span>
              <p>
                <strong>Reconnect</strong> only when two people both choose to be activity buddies.
              </p>
            </div>
          </div>
        </div>
        <div className="works-collage">
          <img
            loading="lazy"
            decoding="async"
            src="/images/purpose-together.webp"
            alt="Two women working creatively together"
          />
          <img
            loading="lazy"
            decoding="async"
            src="/images/purpose-solo.webp"
            alt="A man working independently on an architectural model"
          />
          <span>Simple. Fun. Authentic.</span>
        </div>
      </section>

      <section className="membership" id="membership">
        <div className="membership-heading">
          <p className="section-label">Ready when you are</p>
          <h2>
            Meet real people.
            <br />
            Start doing.
          </h2>
          <p>
            Solo includes 13 sessions a month. Household covers up to 4 people, each with their own sign-in, sharing 16
            sessions a month: 4 each week, shared between household members. Solo can book up to 4 a week, and extra
            sessions are available whenever you want more.
          </p>
        </div>
        <div className="membership-grid">
          <MembershipCard
            label="Solo · Monthly"
            price="$26"
            detail="per month · 13 sessions · cancel anytime"
            accent="monthly"
            plan="Solo monthly"
            step={SOLO_STEP}
          />
          <MembershipCard
            label="Solo · Annual"
            price="$260"
            detail="per year · 13 sessions a month · two months on us"
            accent="annual"
            plan="Solo annual"
            step={SOLO_STEP}
          />
          <MembershipCard
            label="Household · Monthly"
            price="$34"
            detail="per month · up to 4 people · 16 shared sessions"
            accent="household-monthly"
            plan="Household monthly"
            step={HOUSEHOLD_STEP}
          />
          <MembershipCard
            label="Household · Annual"
            price="$349"
            detail="per year · up to 4 people · 16 shared sessions a month"
            accent="household-annual"
            plan="Household annual"
            step={HOUSEHOLD_STEP}
          />
        </div>
      </section>

      <section className="closing">
        <p className="section-label">See what’s waiting</p>
        <h2>
          There’s room
          <br />
          at the table.
        </h2>
        <Link href="/calendar">
          See this week’s sessions <span aria-hidden="true">↗</span>
        </Link>
      </section>
    </main>
  );
}
