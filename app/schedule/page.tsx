import type { Metadata } from 'next';
import Schedule from '@/components/schedule';
import { Lead, Note, PageHead } from '@/components/ui';
import { metaFor } from '@/lib/site';

export const metadata: Metadata = metaFor('/schedule');

export default function SchedulePage() {
  return (
    <main id="main">
      <PageHead eyebrow="Your week" title="Schedule">
        <Lead className="text-fg">
          Pick up to three sessions a week with your membership. Need more? Add an extra session. Cameras are on,
          because showing up as yourself is the point. A Bad Hair Day card lets you skip the camera when you need to.
        </Lead>
        <Note>
          Prototype: bookings are saved in this browser only and no money moves. Prices, times and limits are examples.
        </Note>
      </PageHead>
      <Schedule />
    </main>
  );
}
