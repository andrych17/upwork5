import type { Metadata } from 'next';
import Link from 'next/link';
import { ReportDemo } from '@/components/demos';
import { Lead, PageHead, Section } from '@/components/ui';
import { metaFor } from '@/lib/site';

export const metadata: Metadata = metaFor('/safety');

const LAYERS = [
  ['Paid and verified', 'A card, an email and a phone number are needed to join.'],
  ['Probation', 'New members start in structured sessions and open rooms after 5 clean sessions.'],
  ['Code of conduct', 'No nudity, no harassment, no selling, no recording. Breaking it ends the membership.'],
  ['Rooms lock', 'Rooms lock 10 minutes after the start, so nobody joins late.'],
  ['Two-report rule', 'Two reports from different members within 30 days suspends the account until it is reviewed.'],
  ['Weekly review', 'A person reviews the report queue every week.'],
] as const;

export default function Safety() {
  return (
    <main id="main">
      <PageHead eyebrow="Safe without a supervisor" title="Built so bad behavior is costly and short">
        <Lead className="text-fg">
          Every member is paid and verified, new members start on probation, and Report, Mute and Leave stay on screen
          in every room. Two reports from different members within 30 days suspends the account until a person reviews
          it.
        </Lead>
      </PageHead>
      <Section>
        <div className="grid gap-6 lg:grid-cols-[7fr_5fr] lg:items-start lg:gap-x-12">
          <ol className="grid gap-x-8 sm:grid-cols-2">
            {LAYERS.map(([title, text], i) => (
              <li key={title} className="grid grid-cols-[auto_1fr] gap-3.5 border-t border-line py-4.5">
                <span
                  aria-hidden="true"
                  className="grid size-8 place-items-center rounded-full bg-accent-soft text-[0.85rem] font-bold text-accent tabular-nums"
                >
                  {i + 1}
                </span>
                <div>
                  <h2 className="mb-1 text-[1.1rem] tracking-[-0.01em]">{title}</h2>
                  <p className="text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ol>
          <ReportDemo />
        </div>
        <p className="max-w-prose text-muted">
          No system is risk-free. Families join on one adult account, with an adult in the room. The full{' '}
          <Link href="/rules">Community Rules</Link> spell out what we expect from every member.
        </p>
      </Section>
    </main>
  );
}
