import Link from 'next/link';
import { ACTIVITIES, KINDS, activityHref } from '@/lib/sessions';

// Every activity, grouped by kind, linking to its own page. Used on the home, evenings and activities pages.
export default function ActivityGroups({ heading: Heading = 'h3' }: { heading?: 'h2' | 'h3' }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,250px),1fr))] items-start gap-3.5">
      {KINDS.map((kind) => (
        <div key={kind} className="rounded-card bg-surface px-5 pt-5 pb-2.5 shadow-lift ring-1 ring-line">
          <Heading className="mb-1.5 flex items-center gap-2.5 font-sans text-[0.78rem] font-bold tracking-[0.14em] text-muted uppercase before:size-2 before:rounded-full before:bg-sun before:content-['']">
            {kind}
          </Heading>
          <ul>
            {ACTIVITIES.filter((a) => a.kind === kind).map((a) => (
              <li key={a.slug} className="border-t border-line first:border-t-0">
                <Link href={activityHref(a.title)} className="group grid gap-0.5 py-3 text-fg no-underline">
                  <strong className="font-display text-[1.2rem] tracking-[-0.01em] transition-colors duration-200 group-hover:text-accent">
                    {a.title}
                  </strong>
                  <span className="text-[0.86rem] text-muted">
                    {a.mins} min · {a.who}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
