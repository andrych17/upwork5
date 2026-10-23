'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const PAGES = [['/', 'Home'], ['/rules', 'Rules'], ['/terms', 'Terms'], ['/privacy', 'Privacy']];

export function DocNav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Pages">
      {PAGES.map(([href, label]) => (
        <Link key={href} href={href} aria-current={href === path ? 'page' : undefined}>{label}</Link>
      ))}
    </nav>
  );
}

export function DocFooter() {
  const path = usePathname();
  return (
    <footer className="site-foot">
      <span>Skip the swiping. Start doing.</span>
      <nav aria-label="Footer">
        {PAGES.filter(([href]) => href !== path).map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
      </nav>
    </footer>
  );
}
