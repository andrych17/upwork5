import { BuddyPick, RoomDemo } from '../home-demos';
import { pageMeta } from '../site';

export const metadata = pageMeta('/how-it-works');

export default function HowItWorks() {
  return (
    <main id="main">
      <header className="page-head">
        <span className="eyebrow">How it works</span>
        <h1>How MeetDoConnect works</h1>
        <p className="lead answer">You get 3 credits a week and spend one on any session. Each booking unlocks a prep card with supplies, cost and the run of show. Join at the start time and the screen leads: a timer, prompts and rotating roles. Afterward, tap who you would do it again with.</p>
      </header>

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
    </main>
  );
}
