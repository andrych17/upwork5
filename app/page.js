import Link from 'next/link';
import ActivityGroups from './activity-groups';
import JsonLd from './json-ld';
import { SESSIONS, activityHref } from './sessions';
import { DEFINITION, SITE_NAME, SITE_URL, TAGLINE, pageMeta } from './site';

export const metadata = pageMeta('/');

const STEPS = [
  ['Choose', 'You get 3 credits a week. Spend one on any session in the calendar.'],
  ['Prepare', 'Each booking unlocks a prep card with supplies, cost and the run of show.'],
  ['Do', 'Join at the start time. The screen leads: a timer, prompts and rotating roles.'],
  ['Find your buddies', 'Afterward, tap who you would do it again with. If they tap you too, you are activity buddies.'],
];
const friday = SESSIONS.filter((s) => s.day === 'Fri');

export default function Home() {
  return (
    <main id="main">
      <JsonLd data={{
        '@graph': [
          { '@type': 'Organization', '@id': `${SITE_URL}/#org`, name: SITE_NAME, url: `${SITE_URL}/`, logo: `${SITE_URL}/icons/icon-512.png`, slogan: TAGLINE, description: DEFINITION },
          { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, name: SITE_NAME, url: `${SITE_URL}/`, publisher: { '@id': `${SITE_URL}/#org` } },
        ],
      }} />

      <header className="hero">
        <span className="eyebrow">Live evenings, no bar</span>
        <h1>Meet<span className="do">Do</span>Connect</h1>
        <div className="hero-body">
          <div className="hero-copy">
            <p className="tagline"><span>{TAGLINE}</span></p>
            <p className="lead">Pick three live sessions a week. Make something, work beside someone, or wind down. Prep a simple supply card, log in, and find people worth doing things with.</p>
            <div className="actions">
              <Link className="btn primary big" href="/evenings">See this week&apos;s evenings<span className="arrow" aria-hidden="true">→</span></Link>
              <Link className="btn big" href="/membership">Membership</Link>
            </div>
            <ul className="chips">
              <li>No bar. No hangover.</li>
              <li>Solo, couple or family</li>
              <li>Rooms of about 5</li>
              <li>Cameras optional</li>
            </ul>
          </div>

          <aside className="shell hero-card" aria-label="An example Friday evening">
            <div className="core ink">
              <div className="hero-card-top">
                <span><span className="live" aria-hidden="true" />Friday evening</span>
                <span className="muted">Example times, Central</span>
              </div>
              <ol className="tonight">
                {friday.map((s) => (
                  <li key={s.id}>
                    <span className="t">{s.time}</span>
                    <span>
                      <Link href={activityHref(s.title)}><strong>{s.title}</strong></Link>
                      <span className="muted">{s.kind} · {s.mins} min · {s.seats - s.taken} seats left</span>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="muted small">One credit books any standard session. Cameras optional.</p>
            </div>
          </aside>
        </div>
      </header>

      <section className="section" aria-labelledby="what">
        <div className="section-head">
          <span className="eyebrow">How it works</span>
          <h2 id="what">What is MeetDoConnect?</h2>
          <p className="lead answer">{DEFINITION}</p>
        </div>
        <ol className="steps">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="step">
              <span className="step-num" aria-hidden="true">0{i + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section" aria-labelledby="evenings">
        <div className="section-head">
          <span className="eyebrow">Activities</span>
          <h2 id="evenings">This week&apos;s evenings</h2>
          <p className="lead">Make something, work beside someone, or wind down. Every session has a prep card with supplies, cost and the run of show.</p>
        </div>
        <ActivityGroups />
        <div className="actions">
          <Link className="btn primary" href="/evenings">Open the calendar</Link>
          <Link className="btn" href="/activities">All activities</Link>
        </div>
      </section>

      <section className="section" aria-labelledby="inside">
        <div className="section-head">
          <span className="eyebrow">Friendship first</span>
          <h2 id="inside">No bar. No hangover.</h2>
        </div>
        <div className="features">
          <Link className="feature shell" href="/how-it-works">
            <span className="core ink">
              <span className="eyebrow">No host needed</span>
              <strong>A room that runs itself</strong>
              <span className="muted">Social sessions split into rooms of about 5. A shared timer, prompts that appear at the right moment, and rotating roles do the leading.</span>
              <span className="go" aria-hidden="true">→</span>
            </span>
          </Link>
          <Link className="feature" href="/how-it-works#buddies">
            <strong>Find activity buddies</strong>
            <span className="muted">After a session, tap who you would do it again with. If two people tap each other, a private buddy chat opens.</span>
            <span className="go" aria-hidden="true">→</span>
          </Link>
          <Link className="feature" href="/safety">
            <strong>Built so bad behavior is costly and short</strong>
            <span className="muted">Paid and verified members, probation, rooms that lock, a two-report rule and a weekly review.</span>
            <span className="go" aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className="section" aria-labelledby="price">
        <div className="shell">
          <div className="core ink band">
            <div>
              <span className="eyebrow">Founding member</span>
              <h2 id="price" className="price">$24<small> per month</small></h2>
              <p>3 credits every week. One credit books any standard session.</p>
            </div>
            <Link className="btn primary big" href="/membership">See membership<span className="arrow" aria-hidden="true">→</span></Link>
          </div>
        </div>
      </section>
    </main>
  );
}
