'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  ['/evenings', 'Evenings'],
  ['/activities', 'Activities'],
  ['/how-it-works', 'How it works'],
  ['/safety', 'Safety'],
  ['/membership', 'Membership'],
  ['/widgets-while-you-wait', 'Play'],
];

export default function SiteNav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={path === href || path.startsWith(`${href}/`) ? 'page' : undefined}>{label}</Link>
      ))}
    </nav>
  );
}
