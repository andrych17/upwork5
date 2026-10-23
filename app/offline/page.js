import Link from 'next/link';
import '../docs.css';

export const metadata = { title: 'Offline', robots: { index: false } };

// Shown by public/sw.js when there is no connection and the page asked for was never saved.
export default function Offline() {
  return (
    <main id="main" className="prose">
      <span className="eyebrow">No connection</span>
      <h1>You are offline</h1>
      <p>MeetDoConnect needs a connection to book and join sessions. Check your connection and try again.</p>
      <p><Link href="/">Back to the home page</Link></p>
    </main>
  );
}
