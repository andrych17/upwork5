import type { Metadata } from 'next';
import { BuddyPick, RoomDemo } from '@/components/demos';
import { CheckList, Lead, PageHead, Section, SectionHead } from '@/components/ui';
import { metaFor } from '@/lib/site';

export const metadata: Metadata = metaFor('/how-it-works');

const SPLIT = 'lg:grid-cols-[5fr_7fr] lg:items-center lg:gap-x-[clamp(32px,5vw,72px)]';

export default function HowItWorks() {
  return (
    <main id="main">
      <PageHead eyebrow="How it works" title="How MeetDoConnect works">
        <Lead className="text-fg">
          You get 3 credits a week and spend one on any session. Each booking unlocks a prep card with supplies, cost
          and the run of show. Join at the start time and the screen leads: a timer, prompts and rotating roles.
          Afterward, tap who you would do it again with.
        </Lead>
      </PageHead>

      <Section id="rooms" className={SPLIT}>
        <SectionHead eyebrow="No host needed" title="A room that runs itself">
          <Lead>
            Social sessions split into rooms of about 5. A shared timer, prompts that appear at the right moment, and
            rotating roles do the leading. Quiet sessions have no talking and need no structure beyond a check-in and
            check-out.
          </Lead>
          <p className="max-w-prose text-muted">
            Each round starts in pairs for three minutes, then merges into the group. The activity comes first, so the
            talking has something to talk about.
          </p>
        </SectionHead>
        <RoomDemo />
      </Section>

      <Section
        id="buddies"
        className="lg:grid-cols-[7fr_5fr] lg:items-center lg:gap-x-[clamp(32px,5vw,72px)] [&>:first-child]:lg:order-2"
      >
        <SectionHead eyebrow="Friendship first" title="Find activity buddies">
          <Lead>
            After a session, tap who you would do it again with. Nobody sees who you tapped. If two people tap each
            other, a private buddy chat opens. Dating can happen on its own, with no pressure and no label.
          </Lead>
          <CheckList
            className="mt-1 gap-0 text-muted [&>li]:border-t [&>li]:border-line [&>li]:py-3 [&>li]:before:top-4"
            items={[
              'Only first names, and only people you shared a session with.',
              'One-sided picks stay private. Neither person is told.',
              'Either buddy can unmatch or block at any time.',
              'MeetDoConnect never shares contact details. Buddies decide whether to swap them.',
            ]}
          />
        </SectionHead>
        <BuddyPick />
      </Section>
    </main>
  );
}
