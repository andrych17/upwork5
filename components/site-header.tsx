'use client';

// Site header: a sticky bar with the logo, the main navigation and one call to action.
// Seven links only fit side by side from xl (1280px); below that they live in a drawer.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import InstallButton from './install-button';
import { ButtonLink, Logo, cn } from './ui';

const NAV = [
  { href: '/evenings', label: 'Evenings', desc: 'This week’s calendar and credits' },
  { href: '/activities', label: 'Activities', desc: '13 live sessions, with prep cards' },
  { href: '/how-it-works', label: 'How it works', desc: 'Rooms of about 5 and activity buddies' },
  { href: '/safety', label: 'Safety', desc: 'Verified members and one-tap reports' },
  { href: '/membership', label: 'Membership', desc: '$24 a month, 3 credits a week' },
  { href: '/widgets-while-you-wait', label: 'Play', desc: 'Word Rush, a speed word game' },
] as const;
// The earlier calendar is a plain HTML file in public/, not a Next.js route, so it gets a normal <a>.
const PROTOTYPE = {
  href: '/prototypes/lantern-calendar-v1.html',
  label: 'Lantern Calendar',
  desc: 'The earlier calendar prototype',
};

const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

const DESKTOP_LINK =
  'inline-flex min-h-10 items-center rounded-full px-3.5 text-[0.9rem] font-semibold text-muted no-underline transition-colors duration-200 ease-spring hover:bg-bg hover:text-fg aria-[current=page]:bg-fg aria-[current=page]:text-bg';
const DRAWER_LINK =
  'group flex min-h-14 items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-fg no-underline transition-colors duration-150 hover:bg-bg aria-[current=page]:bg-fg aria-[current=page]:text-bg';

function DrawerItem({ label, desc }: { label: string; desc: string }) {
  return (
    <>
      <span className="grid">
        <span className="font-semibold">{label}</span>
        <span className="text-[0.8rem] text-muted group-aria-[current=page]:text-bg/75">{desc}</span>
      </span>
      <span aria-hidden="true" className="text-muted group-aria-[current=page]:text-bg">
        →
      </span>
    </>
  );
}

export default function SiteHeader() {
  const path = usePathname();
  // The drawer remembers the page it was opened on, so it closes by itself after navigating.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenOn(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="sticky top-3 z-40 sm:top-4">
      <div className="flex min-h-15 items-center justify-between gap-3 rounded-full bg-surface py-2 pr-2 pl-5 shadow-lift ring-1 ring-line">
        <Logo href="/" />

        <nav aria-label="Main" className="hidden items-center gap-0.5 xl:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(path, item.href) ? 'page' : undefined}
              className={DESKTOP_LINK}
            >
              {item.label}
            </Link>
          ))}
          <a href={PROTOTYPE.href} className={DESKTOP_LINK}>
            {PROTOTYPE.label}
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <ButtonLink href="/evenings" variant="primary" className="hidden sm:inline-flex">
            See this week
          </ButtonLink>
          <button
            type="button"
            onClick={() => setOpenOn(open ? null : path)}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="grid size-11 place-items-center rounded-full bg-bg text-fg ring-1 ring-line transition duration-200 ease-spring hover:ring-accent active:scale-95 xl:hidden"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            >
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setOpenOn(null)}
            className="fixed inset-0 -z-10 bg-fg/20 backdrop-blur-[2px]"
          />
          <nav
            id="site-menu"
            aria-label="Menu"
            className="absolute inset-x-0 top-full mt-2 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-3xl bg-surface p-2 shadow-lift ring-1 ring-line sm:left-auto sm:w-96"
          >
            <div className="grid gap-0.5">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive(path, item.href) ? 'page' : undefined}
                  className={DRAWER_LINK}
                >
                  <DrawerItem label={item.label} desc={item.desc} />
                </Link>
              ))}
              <a href={PROTOTYPE.href} className={cn(DRAWER_LINK, 'mt-1 rounded-t-none border-t border-line pt-3')}>
                <DrawerItem label={PROTOTYPE.label} desc={PROTOTYPE.desc} />
              </a>
              <InstallButton inMenu />
            </div>
            <ButtonLink
              href="/evenings"
              variant="primary"
              size="lg"
              arrow="→"
              className="mt-2 w-full justify-between sm:hidden"
            >
              See this week’s evenings
            </ButtonLink>
          </nav>
        </>
      )}
    </header>
  );
}
