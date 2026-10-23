import Link from 'next/link';
import '../docs.css';

export const metadata = { title: 'Offline' };

// Shown by public/sw.js when there is no connection and the page asked for was never saved.
export default function Offline() {
  return (
    <div className="wrap doc">
      <div className="bar"><Link className="logo" href="/">Meet<b>Do</b>Connect</Link></div>
      <main id="main" className="prose">
        <span className="eyebrow">No connection</span>
        <h1>You are offline</h1>
        <p>MeetDoConnect needs a connection to book and join sessions. Check your connection and try again.</p>
        <p><Link href="/">Back to the home page</Link></p>
      </main>
    </div>
  );
}
