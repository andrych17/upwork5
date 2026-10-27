import type { Metadata } from 'next';
import Link from 'next/link';
import { Eyebrow } from '@/components/ui';

export const metadata: Metadata = { title: 'Page not found' }; // Next.js adds noindex to this page itself

export default function NotFound() {
  return (
    <main id="main" className="doc">
      <Eyebrow>404</Eyebrow>
      <h1>This page is not here</h1>
      <p>The link may be old or mistyped. These are good places to start:</p>
      <ul>
        <li>
          <Link href="/calendar">This week’s sessions</Link>
        </li>
        <li>
          <Link href="/games">Games</Link>
        </li>
        <li>
          <Link href="/">The home page</Link>
        </li>
      </ul>
    </main>
  );
}
