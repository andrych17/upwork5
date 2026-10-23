import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import JsonLd from '@/components/json-ld';
import { ButtonLink, CheckList, Eyebrow, Note, Section, SectionHead, Shell } from '@/components/ui';
import { ACTIVITIES, activityHref, findActivity, type Activity } from '@/lib/sessions';
import { SITE_URL, pageMeta } from '@/lib/site';

export const dynamicParams = false;

export function generateStaticParams() {
  return ACTIVITIES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: PageProps<'/activities/[slug]'>): Promise<Metadata> {
  const a = findActivity((await params).slug);
  if (!a) return {};
  return pageMeta(`/activities/${a.slug}`, {
    title: `${a.title} · ${a.mins}-minute live session`,
    description: `${a.blurb} ${a.mins} minutes, for ${a.who.toLowerCase()}. Supplies ${a.cost}.`,
  });
}

// Others of the same kind first, then the rest, three in all.
function related(a: Activity): Activity[] {
  const others = ACTIVITIES.filter((b) => b.slug !== a.slug);
  return [...others.filter((b) => b.kind === a.kind), ...others.filter((b) => b.kind !== a.kind)].slice(0, 3);
}

export default async function ActivityPage({ params }: PageProps<'/activities/[slug]'>) {
  const a = findActivity((await params).slug);
  if (!a) notFound();
  const url = `${SITE_URL}/activities/${a.slug}`;
  const facts = [
    ['Length', `${a.mins} minutes`],
    ['Room', a.mode],
    ['For', a.who],
    ['Supplies', a.cost],
  ] as const;

  return (
    <main id="main">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
                { '@type': 'ListItem', position: 2, name: 'Activities', item: `${SITE_URL}/activities` },
                { '@type': 'ListItem', position: 3, name: a.title, item: url },
              ],
            },
            {
              '@type': 'HowTo',
              name: a.title,
              description: a.blurb,
              totalTime: `PT${a.mins}M`,
              supply: a.supplies.map((name) => ({ '@type': 'HowToSupply', name })),
              step: a.run.map((text, i) => ({ '@type': 'HowToStep', position: i + 1, text })),
            },
          ],
        }}
      />

      <nav aria-label="Breadcrumb" className="pt-5">
        <ol className="flex flex-wrap gap-1.5 text-[0.88rem] text-muted">
          <li>
            <Link href="/" className="text-muted">
              Home
            </Link>
          </li>
          <li className="before:mr-1.5 before:text-line-strong before:content-['/']">
            <Link href="/activities" className="text-muted">
              Activities
            </Link>
          </li>
          <li aria-current="page" className="before:mr-1.5 before:text-line-strong before:content-['/']">
            {a.title}
          </li>
        </ol>
      </nav>

      <header className="grid max-w-[52rem] gap-4 pt-[clamp(20px,4vw,40px)]">
        <Eyebrow>{a.kind}</Eyebrow>
        <h1 className="text-title">{a.title}</h1>
        <p className="max-w-prose text-lead">{a.blurb}</p>
      </header>

      <div className="grid gap-7 pt-[clamp(28px,4vw,48px)] lg:grid-cols-[4fr_8fr] lg:items-start lg:gap-x-12">
        <Shell className="lg:sticky lg:top-(--sticky-top)">
          <dl>
            {facts.map(([label, value]) => (
              <div key={label} className="grid gap-0.5 border-t border-line py-3 first:border-t-0 first:pt-0">
                <dt className="text-[0.72rem] font-bold tracking-[0.14em] text-muted uppercase">{label}</dt>
                <dd className="font-semibold">{value}</dd>
              </div>
            ))}
            <div className="grid gap-0.5 border-t border-line pt-3">
              <dt className="text-[0.72rem] font-bold tracking-[0.14em] text-muted uppercase">This week</dt>
              <dd className="font-semibold">
                {a.times.join(', ')}
                <span className="text-sm font-normal text-muted"> (example times, Central)</span>
              </dd>
            </div>
          </dl>
        </Shell>

        <div className="grid content-start gap-7">
          <section aria-labelledby="supplies">
            <h2 id="supplies" className="mb-3 text-[clamp(1.5rem,3vw,2rem)]">
              Supplies
            </h2>
            <CheckList items={a.supplies} />
          </section>
          <section aria-labelledby="run">
            <h2 id="run" className="mb-3 text-[clamp(1.5rem,3vw,2rem)]">
              Run of show
            </h2>
            <ol className="grid gap-2">
              {a.run.map((step) => {
                const [time, ...rest] = step.split(': ');
                return (
                  <li
                    key={step}
                    className="grid grid-cols-[5.5rem_1fr] items-baseline gap-3 rounded-2xl bg-surface px-4 py-3 ring-1 ring-line"
                  >
                    <span className="font-display font-bold text-accent tabular-nums">{time}</span>
                    {rest.join(': ')}
                  </li>
                );
              })}
            </ol>
          </section>
          {a.safety && <Note>{a.safety}</Note>}
          <div className="flex flex-wrap items-center gap-2.5">
            <ButtonLink href="/evenings" variant="primary" size="lg" arrow="→">
              Book on the calendar
            </ButtonLink>
            <ButtonLink href="/membership" size="lg">
              Membership
            </ButtonLink>
          </div>
        </div>
      </div>

      <Section aria-labelledby="more">
        <SectionHead id="more" title="More evenings" />
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-3.5">
          {related(a).map((b) => (
            <li key={b.slug}>
              <Link
                href={activityHref(b.title)}
                className="grid h-full content-start gap-2 rounded-card bg-surface p-5.5 text-fg no-underline shadow-lift ring-1 ring-line transition-transform duration-300 ease-spring hover:-translate-y-0.5"
              >
                <Eyebrow>{b.kind}</Eyebrow>
                <strong className="font-display text-[1.35rem] tracking-[-0.015em]">{b.title}</strong>
                <span className="text-muted">{b.blurb}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}
