import ActivityGroups from '../activity-groups';
import { Planner } from '../home-demos';
import { pageMeta } from '../site';

export const metadata = pageMeta('/evenings');

export default function Evenings() {
  return (
    <main id="main">
      <header className="page-head">
        <span className="eyebrow">Prototype calendar</span>
        <h1>This week&apos;s evenings</h1>
        <p className="lead">Pick three live sessions a week. Spend one credit on any session, open its prep card, and choose how you want to be reminded.</p>
        <p className="note">Example seats and times (Central). Bookings are not saved and nothing is sent or charged.</p>
      </header>
      <Planner />
      <section className="section" aria-labelledby="all">
        <div className="section-head">
          <span className="eyebrow">Every session</span>
          <h2 id="all">All activities</h2>
        </div>
        <ActivityGroups />
      </section>
    </main>
  );
}
