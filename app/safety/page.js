import Link from 'next/link';
import { ReportDemo } from '../home-demos';
import { pageMeta } from '../site';

export const metadata = pageMeta('/safety');

const LAYERS = [
  ['Paid and verified', 'A card, an email and a phone number are needed to join.'],
  ['Probation', 'New members start in structured sessions and open rooms after 5 clean sessions.'],
  ['Code of conduct', 'No nudity, no harassment, no selling, no recording. Breaking it ends the membership.'],
  ['Rooms lock', 'Rooms lock 10 minutes after the start, so nobody joins late.'],
  ['Two-report rule', 'Two reports from different members within 30 days suspends the account until it is reviewed.'],
  ['Weekly review', 'A person reviews the report queue every week.'],
];

export default function Safety() {
  return (
    <main id="main">
      <header className="page-head">
        <span className="eyebrow">Safe without a supervisor</span>
        <h1>Built so bad behavior is costly and short</h1>
        <p className="lead answer">Every member is paid and verified, new members start on probation, and Report, Mute and Leave stay on screen in every room. Two reports from different members within 30 days suspends the account until a person reviews it.</p>
      </header>
      <section className="section">
        <div className="safety">
          <ol className="layers">
            {LAYERS.map(([title, text], i) => (
              <li key={title}>
                <span className="layer-num" aria-hidden="true">{i + 1}</span>
                <div><h2>{title}</h2><p className="muted">{text}</p></div>
              </li>
            ))}
          </ol>
          <ReportDemo />
        </div>
        <p className="muted">No system is risk-free. Families join on one adult account, with an adult in the room. The full <Link href="/rules">Community Rules</Link> spell out what we expect from every member.</p>
      </section>
    </main>
  );
}
