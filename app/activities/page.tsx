import type { Metadata } from 'next';
import ActivityGroups from '@/components/activity-groups';
import JsonLd from '@/components/json-ld';
import { Lead, PageHead } from '@/components/ui';
import { ACTIVITIES } from '@/lib/sessions';
import { SITE_URL, metaFor } from '@/lib/site';

export const metadata: Metadata = metaFor('/activities');

export default function Activities() {
  return (
    <main id="main">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'MeetDoConnect activities',
          itemListElement: ACTIVITIES.map((a, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: a.title,
            url: `${SITE_URL}/activities/${a.slug}`,
          })),
        }}
      />
      <PageHead eyebrow="Activities" title="Every evening on the calendar">
        <Lead className="text-fg">
          Make something, work beside someone, or wind down. MeetDoConnect has {ACTIVITIES.length} live sessions, from
          quiet co-working to mocktails, sketching and trivia. Each one has a prep card with supplies, cost and the run
          of show, and most need only kitchen and craft-drawer items.
        </Lead>
      </PageHead>
      <section className="pt-[clamp(32px,5vw,56px)]">
        <ActivityGroups heading="h2" />
      </section>
    </main>
  );
}
