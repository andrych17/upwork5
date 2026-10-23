import type { Metadata } from 'next';
import ActivityGroups from '@/components/activity-groups';
import { Planner } from '@/components/demos';
import { Lead, Note, PageHead, Section, SectionHead } from '@/components/ui';
import { EXAMPLE_NOW, PASSES_PER_MONTH } from '@/lib/sessions';
import { metaFor } from '@/lib/site';

export const metadata: Metadata = metaFor('/evenings');

export default function Evenings() {
  return (
    <main id="main">
      <PageHead eyebrow="Prototype calendar" title="This week’s evenings">
        <Lead className="text-fg">
          Spend one of your weekly credits on any session. Cancel 24 hours or more before the start and the credit comes
          back; inside 24 hours it is used.{' '}
          {PASSES_PER_MONTH === 1 ? 'Once a month' : `${PASSES_PER_MONTH} times a month`}, a Bad Hair Day pass lets you
          cancel late and keep the credit, or join with your camera off, no questions asked.
        </Lead>
        <Note>
          Example seats and times (Central), and an example clock: it is {EXAMPLE_NOW}. Bookings are not saved and
          nothing is sent or charged.
        </Note>
      </PageHead>
      <Planner />
      <Section aria-labelledby="all">
        <SectionHead id="all" eyebrow="Every session" title="All activities" />
        <ActivityGroups />
      </Section>
    </main>
  );
}
