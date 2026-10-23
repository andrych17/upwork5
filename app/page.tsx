import type { Metadata } from 'next';
import Link from 'next/link';
import ActivityGroups from '@/components/activity-groups';
import JsonLd from '@/components/json-ld';
import InstallButton from '@/components/install-button';
import { ButtonLink, Eyebrow, Lead, LiveDot, Section, SectionHead, Shell, cn } from '@/components/ui';
import { SESSIONS, activityHref } from '@/lib/sessions';
import { DEFINITION, SITE_NAME, SITE_URL, TAGLINE, metaFor } from '@/lib/site';

export const metadata: Metadata = metaFor('/');

const STEPS = [
  ['Choose', 'You get 3 credits a week. Spend one on any session in the calendar.'],
  ['Prepare', 'Each booking unlocks a prep card with supplies, cost and the run of show.'],
  ['Do', 'Join at the start time. The screen leads: a timer, prompts and rotating roles.'],
  [
    'Find your buddies',
    'Afterward, tap who you would do it again with. If they tap you too, you are activity buddies.',
  ],
] as const;
// Wide-narrow, then narrow-wide on large screens.
const STEP_STYLE = [
  'bg-sun-soft lg:col-span-7 [&>span]:text-accent',
  'bg-surface lg:col-span-5',
  'bg-surface lg:col-span-5',
  'bg-accent-soft lg:col-span-7',
];
const CHIPS = ['No bar. No hangover.', 'Solo, couple or family', 'Rooms of about 5', 'Cameras optional'];
const CARD = 'rounded-card shadow-lift ring-1 ring-line';
const friday = SESSIONS.filter((s) => s.day === 'Fri');

function GoArrow({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'absolute top-5 right-5.5 grid size-10 place-items-center rounded-full bg-bg transition-transform duration-300 ease-spring group-hover:translate-x-0.5',
        className,
      )}
    >
      →
    </span>
  );
}

export default function Home() {
  return (
    <main id="main">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Organization',
              '@id': `${SITE_URL}/#org`,
              name: SITE_NAME,
              url: `${SITE_URL}/`,
              logo: `${SITE_URL}/icons/icon-512.png`,
              slogan: TAGLINE,
              description: DEFINITION,
            },
            {
              '@type': 'WebSite',
              '@id': `${SITE_URL}/#website`,
              name: SITE_NAME,
              url: `${SITE_URL}/`,
              publisher: { '@id': `${SITE_URL}/#org` },
            },
          ],
        }}
      />

      <header className="grid gap-4.5 pt-[clamp(24px,6vw,72px)]">
        <Eyebrow>Live evenings, no bar</Eyebrow>
        <h1 className="text-hero">
          Meet<span className="text-accent">Do</span>Connect
        </h1>
        <div className="mt-2 grid gap-[clamp(32px,4vw,56px)] lg:grid-cols-[7fr_5fr] lg:items-start">
          <div className="grid content-start gap-5.5">
            <p className="font-display text-[clamp(1.4rem,3.2vw,2.1rem)] leading-tight font-semibold tracking-[-0.02em]">
              <span className="bg-[linear-gradient(transparent_62%,color-mix(in_srgb,var(--sun)_70%,transparent)_62%_92%,transparent_92%)]">
                {TAGLINE}
              </span>
            </p>
            <Lead>
              Pick three live sessions a week. Make something, work beside someone, or wind down. Prep a simple supply
              card, log in, and find people worth doing things with.
            </Lead>
            <div className="flex flex-wrap items-center gap-2.5">
              <ButtonLink href="/evenings" variant="primary" size="lg" arrow="→">
                See this week&apos;s evenings
              </ButtonLink>
              <ButtonLink href="/membership" size="lg">
                Membership
              </ButtonLink>
            </div>
            <InstallButton />
            <ul className="flex flex-wrap gap-2">
              {CHIPS.map((chip) => (
                <li
                  key={chip}
                  className="rounded-full bg-surface px-3.5 py-1.5 text-[0.9rem] font-semibold ring-1 ring-line"
                >
                  {chip}
                </li>
              ))}
            </ul>
          </div>

          <Shell
            ink
            as="aside"
            aria-label="An example Friday evening"
            className="transition-transform duration-600 ease-spring lg:rotate-[1.5deg] lg:hover:rotate-0"
          >
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1.5 text-[0.85rem] font-semibold">
              <span className="inline-flex items-center gap-2.5">
                <LiveDot />
                Friday evening
              </span>
              <span className="text-muted">Example times, Central</span>
            </div>
            <ol>
              {friday.map((s) => (
                <li key={s.id} className="grid grid-cols-[5.2rem_1fr] gap-3 border-t border-line py-4.5">
                  <span className="font-display font-bold text-accent tabular-nums">{s.time}</span>
                  <span>
                    <Link href={activityHref(s.title)} className="group text-fg no-underline">
                      <strong className="mb-1 block font-display text-[1.35rem] leading-tight tracking-[-0.015em] decoration-accent group-hover:underline">
                        {s.title}
                      </strong>
                    </Link>
                    <span className="text-[0.88rem] text-muted">
                      {s.kind} · {s.mins} min · {s.seats - s.taken} seats left
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-sm text-muted">One credit books any standard session. Cameras optional.</p>
          </Shell>
        </div>
      </header>

      <Section aria-labelledby="what">
        <SectionHead id="what" eyebrow="How it works" title="What is MeetDoConnect?">
          <Lead className="text-fg">{DEFINITION}</Lead>
        </SectionHead>
        <ol className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-12">
          {STEPS.map(([title, text], i) => (
            <li
              key={title}
              className={cn(
                CARD,
                'relative grid min-h-40 content-end gap-2.5 overflow-hidden p-[clamp(22px,3vw,34px)] sm:min-h-52',
                STEP_STYLE[i],
              )}
            >
              <span
                aria-hidden="true"
                className="absolute top-3.5 right-5.5 font-display text-[clamp(3.5rem,7vw,5.5rem)] leading-none font-bold tracking-[-0.06em] text-sun"
              >
                0{i + 1}
              </span>
              <h3 className="max-w-[14ch] text-[clamp(1.4rem,2.4vw,1.9rem)]">{title}</h3>
              <p className="max-w-[40ch] text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section aria-labelledby="evenings">
        <SectionHead id="evenings" eyebrow="Activities" title="This week’s evenings">
          <Lead>
            Make something, work beside someone, or wind down. Every session has a prep card with supplies, cost and the
            run of show.
          </Lead>
        </SectionHead>
        <ActivityGroups />
        <div className="flex flex-wrap items-center gap-2.5">
          <ButtonLink href="/evenings" variant="primary">
            Open the calendar
          </ButtonLink>
          <ButtonLink href="/activities">All activities</ButtonLink>
        </div>
      </Section>

      <Section aria-labelledby="inside">
        <SectionHead id="inside" eyebrow="Friendship first" title="No bar. No hangover." />
        <div className="grid gap-3.5 lg:grid-cols-12">
          <Link href="/how-it-works" className="group text-fg no-underline lg:col-span-7 lg:row-span-2">
            <Shell
              ink
              className="h-full transition-transform duration-300 ease-spring group-hover:-translate-y-0.5"
              coreClassName="relative h-full content-end gap-2.5 p-[clamp(22px,3vw,36px)] lg:min-h-[420px]"
            >
              <Eyebrow>No host needed</Eyebrow>
              <strong className="max-w-[18ch] font-display text-[clamp(1.4rem,2.6vw,2.1rem)] leading-tight tracking-[-0.02em]">
                A room that runs itself
              </strong>
              <span className="max-w-[46ch] text-muted">
                Social sessions split into rooms of about 5. A shared timer, prompts that appear at the right moment,
                and rotating roles do the leading.
              </span>
              <GoArrow className="top-6 right-7 bg-surface" />
            </Shell>
          </Link>
          {(
            [
              [
                '/how-it-works#buddies',
                'Find activity buddies',
                'After a session, tap who you would do it again with. If two people tap each other, a private buddy chat opens.',
              ],
              [
                '/safety',
                'Built so bad behavior is costly and short',
                'Paid and verified members, probation, rooms that lock, a two-report rule and a weekly review.',
              ],
            ] as const
          ).map(([href, title, text]) => (
            <Link
              key={href}
              href={href}
              className={cn(
                CARD,
                'group relative grid min-h-50 content-end gap-2.5 bg-surface p-[clamp(22px,3vw,32px)] text-fg no-underline transition-transform duration-300 ease-spring hover:-translate-y-0.5 lg:col-span-5',
              )}
            >
              <strong className="max-w-[18ch] font-display text-[clamp(1.4rem,2.6vw,2.1rem)] leading-tight tracking-[-0.02em]">
                {title}
              </strong>
              <span className="max-w-[46ch] text-muted">{text}</span>
              <GoArrow />
            </Link>
          ))}
        </div>
      </Section>

      <Section aria-labelledby="price">
        <Shell ink coreClassName="flex flex-wrap items-end justify-between gap-6 p-[clamp(24px,4vw,48px)]">
          <div className="grid gap-3.5">
            <Eyebrow>Founding member</Eyebrow>
            <h2
              id="price"
              className="font-display text-[clamp(3.5rem,8vw,5.2rem)] leading-[0.9] font-bold tracking-[-0.045em]"
            >
              $24<small className="font-sans text-base font-medium tracking-normal text-muted"> per month</small>
            </h2>
            <p>3 credits every week. One credit books any standard session.</p>
          </div>
          <ButtonLink href="/membership" variant="primary" size="lg" arrow="→">
            See membership
          </ButtonLink>
        </Shell>
      </Section>
    </main>
  );
}
