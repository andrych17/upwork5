import ActivityGroups from '../activity-groups';
import JsonLd from '../json-ld';
import { ACTIVITIES } from '../sessions';
import { SITE_URL, pageMeta } from '../site';

export const metadata = pageMeta('/activities');

export default function Activities() {
  return (
    <main id="main">
      <JsonLd data={{
        '@type': 'ItemList',
        name: 'MeetDoConnect activities',
        itemListElement: ACTIVITIES.map((a, i) => ({ '@type': 'ListItem', position: i + 1, name: a.title, url: `${SITE_URL}/activities/${a.slug}` })),
      }} />
      <header className="page-head">
        <span className="eyebrow">Activities</span>
        <h1>Every evening on the calendar</h1>
        <p className="lead answer">Make something, work beside someone, or wind down. MeetDoConnect has {ACTIVITIES.length} live sessions, from quiet co-working to mocktails, sketching and trivia. Each one has a prep card with supplies, cost and the run of show, and most need only kitchen and craft-drawer items.</p>
      </header>
      <section className="section tight">
        <ActivityGroups heading="h2" />
      </section>
    </main>
  );
}
