import Link from 'next/link';
import { ACTIVITIES, KINDS } from './sessions';

// Every activity, grouped by kind, linking to its own page. Used on the home and activities pages.
export default function ActivityGroups({ heading: H = 'h3' }) {
  return (
    <div className="kinds">
      {KINDS.map((kind) => (
        <div key={kind} className="kind">
          <H>{kind}</H>
          <ul>
            {ACTIVITIES.filter((a) => a.kind === kind).map((a) => (
              <li key={a.slug}>
                <Link href={`/activities/${a.slug}`}>
                  <strong>{a.title}</strong>
                  <span className="muted">{a.mins} min · {a.who}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
