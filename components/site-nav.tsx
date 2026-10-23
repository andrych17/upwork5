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
] as const;

export default function SiteNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-wrap gap-0.5 rounded-3xl bg-shell p-1 ring-1 ring-line">
      {LINKS.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={path === href || path.startsWith(`${href}/`) ? 'page' : undefined}
          className="inline-flex min-h-10 items-center rounded-full px-3.5 py-2 text-[0.9rem] font-semibold text-fg no-underline transition-colors duration-200 ease-spring hover:bg-surface aria-[current=page]:bg-fg aria-[current=page]:text-bg"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
