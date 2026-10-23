import Link from 'next/link';
import { BuddyPick, JoinButton, Planner, ReportDemo, RoomDemo } from './home-demos';
import { SESSIONS } from './sessions';
import './home.css';

const STEPS = [
  ['Choose', 'You get 3 credits a week. Spend one on any session in the calendar below.'],
  ['Prepare', 'Each booking unlocks a prep card with supplies, cost and the run of show.'],
  ['Do', 'Join at the start time. The screen leads: a timer, prompts and rotating roles.'],
  ['Find your buddies', 'Afterward, tap who you would do it again with. If they tap you too, you are activity buddies.'],
];
const LAYERS = [
  ['Paid and verified', 'A card, an email and a phone number are needed to join.'],
  ['Probation', 'New members start in structured sessions and open rooms after 5 clean sessions.'],
  ['Code of conduct', 'No nudity, no harassment, no selling, no recording. Breaking it ends the membership.'],
  ['Rooms lock', 'Rooms lock 10 minutes after the start, so nobody joins late.'],
  ['Two-report rule', 'Two reports from different members within 30 days suspends the account until it is reviewed.'],
  ['Weekly review', 'A person reviews the report queue every week.'],
];
const FAQ = [
  ['Is this a sobriety program?', 'No. It is for anyone who wants a good evening without alcohol, whether they drink sometimes or never. It is not treatment or recovery support.'],
  ['Do I need to be creative or on camera?', 'No. Most sessions walk you through each step, and cameras are optional.'],
  ['What do I need to buy?', 'The prep card lists supplies, mostly kitchen and craft-drawer items, with an estimated cost.'],
  ['Can kids join?', 'Kitchen-Table Lab, Mocktail Studio and Cards and Collage Night are made for families. An adult books and stays in the room.'],
  ['Are sessions recorded?', 'No, so people can relax and take part.'],
];
const friday = SESSIONS.filter((s) => s.day === 'Fri');

export default function Home() {
  return (
    <div className="wrap home">
      <div className="bar">
        <div className="logo">Meet<b>Do</b>Connect</div>
        <nav className="nav" aria-label="Sections">
          <a href="#evenings">This week</a>
          <a href="#rooms">How rooms work</a>
          <a href="#buddies">Buddies</a>
          <a href="#safety">Safety</a>
          <a href="#join">Join</a>
          <Link href="/widgets-while-you-wait">Play while you wait</Link>
        </nav>
      </div>

      <main id="main">
        <header className="hero">
          <span className="eyebrow">Live evenings, no bar</span>
          <h1>Meet<span className="do">Do</span>Connect</h1>
          <div className="hero-body">
          <div className="hero-copy">
            <p className="tagline"><span>Skip the swiping. Start doing.</span></p>
            <p className="lead">Pick three live sessions a week. Make something, work beside someone, or wind down. Prep a simple supply card, log in, and find people worth doing things with.</p>
            <div className="actions">
              <a className="btn primary big" href="#evenings">See this week&apos;s evenings<span className="arrow" aria-hidden="true">↓</span></a>
              <a className="btn big" href="#join">Membership</a>
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
                      <strong>{s.title}</strong>
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

        <section className="section" aria-labelledby="how-title">
          <div className="section-head">
            <span className="eyebrow">Four steps</span>
            <h2 id="how-title">How it works</h2>
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

        <Planner />

        <section id="rooms" className="section split">
          <div className="section-head">
            <span className="eyebrow">No host needed</span>
            <h2>A room that runs itself</h2>
            <p className="lead">Social sessions split into rooms of about 5. A shared timer, prompts that appear at the right moment, and rotating roles do the leading. Quiet sessions have no talking and need no structure beyond a check-in and check-out.</p>
            <p className="muted">Each round starts in pairs for three minutes, then merges into the group. The activity comes first, so the talking has something to talk about.</p>
          </div>
          <RoomDemo />
        </section>

        <section id="buddies" className="section split flip">
          <div className="section-head">
            <span className="eyebrow">Friendship first</span>
            <h2>Find activity buddies</h2>
            <p className="lead">After a session, tap who you would do it again with. Nobody sees who you tapped. If two people tap each other, a private buddy chat opens. Dating can happen on its own, with no pressure and no label.</p>
            <ul className="assure">
              <li>Only first names, and only people you shared a session with.</li>
              <li>One-sided picks stay private. Neither person is told.</li>
              <li>Either buddy can unmatch or block at any time.</li>
              <li>MeetDoConnect never shares contact details. Buddies decide whether to swap them.</li>
            </ul>
          </div>
          <BuddyPick />
        </section>

        <section id="safety" className="section">
          <div className="section-head">
            <span className="eyebrow">Safe without a supervisor</span>
            <h2>Built so bad behavior is costly and short</h2>
          </div>
          <div className="safety">
            <ol className="layers">
              {LAYERS.map(([title, text], i) => (
                <li key={title}>
                  <span className="layer-num" aria-hidden="true">{i + 1}</span>
                  <div><h3>{title}</h3><p className="muted">{text}</p></div>
                </li>
              ))}
            </ol>
            <ReportDemo />
          </div>
          <p className="muted">No system is risk-free. Families join on one adult account, with an adult in the room.</p>
        </section>

        <section id="join" className="section">
          <div className="section-head">
            <span className="eyebrow">Pricing</span>
            <h2>Membership</h2>
          </div>
          <div className="join">
            <div className="shell">
              <div className="core ink price-card">
                <span className="eyebrow">Founding member</span>
                <div className="price">$24<small> per month</small></div>
                <p>3 credits every week. One credit books any standard session.</p>
                <ul className="checks">
                  <li>Extra credits: $4 each, or a 5-pack for $15</li>
                  <li>Add a partner or family for $8 a month; your household uses one credit per session</li>
                  <li>Cancel a booking up to 3 hours ahead and the credit returns</li>
                </ul>
                <JoinButton />
              </div>
            </div>
            <div className="faq-list">
              <h3>Questions</h3>
              {FAQ.map(([q, a]) => (
                <details key={q} className="faq">
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="site-foot">
        <div>
          <div className="logo">Meet<b>Do</b>Connect</div>
          <div>Skip the swiping. Start doing.</div>
        </div>
        <nav aria-label="Footer">
          <Link href="/widgets-while-you-wait">Word Rush</Link>
          <Link href="/rules">Community Rules</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </footer>
    </div>
  );
}
