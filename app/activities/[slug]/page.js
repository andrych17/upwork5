import Link from 'next/link';
import { notFound } from 'next/navigation';
import JsonLd from '../../json-ld';
import { ACTIVITIES } from '../../sessions';
import { SITE_URL, pageMeta } from '../../site';

export const dynamicParams = false;

export function generateStaticParams() {
  return ACTIVITIES.map((a) => ({ slug: a.slug }));
}

const find = (slug) => ACTIVITIES.find((a) => a.slug === slug);

export async function generateMetadata({ params }) {
  const a = find((await params).slug);
  if (!a) return {};
  return pageMeta(`/activities/${a.slug}`, {
    title: `${a.title} · ${a.mins}-minute live session`,
    description: `${a.blurb} ${a.mins} minutes, for ${a.who.toLowerCase()}. Supplies ${a.cost}.`,
  });
}

// Others of the same kind first, then the rest, three in all.
function related(a) {
  const others = ACTIVITIES.filter((b) => b.slug !== a.slug);
  return [...others.filter((b) => b.kind === a.kind), ...others.filter((b) => b.kind !== a.kind)].slice(0, 3);
}

export default async function Activity({ params }) {
  const a = find((await params).slug);
  if (!a) notFound();
  const url = `${SITE_URL}/activities/${a.slug}`;
  return (
    <main id="main" className="activity">
      <JsonLd data={{
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
      }} />

      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          <li><Link href="/">Home</Link></li>
          <li><Link href="/activities">Activities</Link></li>
          <li aria-current="page">{a.title}</li>
        </ol>
      </nav>

      <header className="page-head">
        <span className="eyebrow">{a.kind}</span>
        <h1>{a.title}</h1>
        <p className="lead answer">{a.blurb}</p>
      </header>

      <div className="activity-body">
        <div className="shell facts-shell">
          <dl className="core facts">
            <div><dt>Length</dt><dd>{a.mins} minutes</dd></div>
            <div><dt>Room</dt><dd>{a.mode}</dd></div>
            <div><dt>For</dt><dd>{a.who}</dd></div>
            <div><dt>Supplies</dt><dd>{a.cost}</dd></div>
            <div><dt>This week</dt><dd>{a.times.join(', ')}<span className="muted small"> (example times, Central)</span></dd></div>
          </dl>
        </div>

        <div className="activity-main">
          <section aria-labelledby="supplies">
            <h2 id="supplies">Supplies</h2>
            <ul className="checks">{a.supplies.map((x) => <li key={x}>{x}</li>)}</ul>
          </section>
          <section aria-labelledby="run">
            <h2 id="run">Run of show</h2>
            <ol className="run">
              {a.run.map((step) => {
                const [time, ...rest] = step.split(': ');
                return <li key={step}><span className="run-time">{time}</span>{rest.join(': ')}</li>;
              })}
            </ol>
          </section>
          {a.safety && <p className="note">{a.safety}</p>}
          <div className="actions">
            <Link className="btn primary big" href="/evenings">Book on the calendar<span className="arrow" aria-hidden="true">→</span></Link>
            <Link className="btn big" href="/membership">Membership</Link>
          </div>
        </div>
      </div>

      <section className="section" aria-labelledby="more">
        <div className="section-head"><h2 id="more">More evenings</h2></div>
        <ul className="related">
          {related(a).map((b) => (
            <li key={b.slug}>
              <Link href={`/activities/${b.slug}`}>
                <span className="eyebrow">{b.kind}</span>
                <strong>{b.title}</strong>
                <span className="muted">{b.blurb}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
