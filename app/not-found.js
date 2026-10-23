import Link from 'next/link';
import './docs.css';

export const metadata = { title: 'Page not found' }; // Next.js adds noindex to this page itself

export default function NotFound() {
  return (
    <main id="main" className="prose">
      <span className="eyebrow">404</span>
      <h1>This page is not here</h1>
      <p>The link may be old or mistyped. These are good places to start:</p>
      <ul>
        <li><Link href="/evenings">This week&apos;s evenings</Link></li>
        <li><Link href="/activities">All activities</Link></li>
        <li><Link href="/">The home page</Link></li>
      </ul>
    </main>
  );
}
