'use client';

import { useEffect, useState } from 'react';
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
  const [open, setOpen] = useState(false);

  // Close menu automatically on route change
  useEffect(() => {
    setOpen(false);
  }, [path]);

  // Close menu when pressing Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {/* Desktop Navigation (visible on md screens and up) */}
      <nav aria-label="Main" className="hidden md:flex flex-wrap gap-0.5 rounded-3xl bg-shell p-1 ring-1 ring-line">
        {LINKS.map(([href, label]) => {
          const active = path === href || path.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className="inline-flex min-h-10 items-center rounded-full px-3.5 py-2 text-[0.9rem] font-semibold text-fg no-underline transition-colors duration-200 ease-spring hover:bg-surface aria-[current=page]:bg-fg aria-[current=page]:text-bg"
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Mobile Navigation (visible on screens smaller than md) */}
      <div className="relative md:hidden">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-shell text-fg ring-1 ring-line transition-colors hover:bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
        >
          {open ? (
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>

        {/* Mobile Dropdown Panel */}
        {open && (
          <>
            {/* Backdrop for outside click */}
            <div
              className="fixed inset-0 z-40 bg-fg/10 backdrop-blur-xs"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />

            {/* Floating Menu Drawer */}
            <nav
              aria-label="Mobile Navigation"
              className="absolute right-0 top-full z-50 mt-2 w-64 origin-top-right rounded-2xl bg-surface p-2 shadow-lift ring-1 ring-line"
            >
              <div className="flex flex-col gap-1">
                {LINKS.map(([href, label]) => {
                  const active = path === href || path.startsWith(`${href}/`);
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className="flex min-h-11 items-center justify-between rounded-xl px-4 py-2.5 text-[0.95rem] font-semibold text-fg no-underline transition-colors hover:bg-shell aria-[current=page]:bg-fg aria-[current=page]:text-bg"
                    >
                      <span>{label}</span>
                      <span className="text-xs opacity-50" aria-hidden="true">
                        →
                      </span>
                    </Link>
                  );
                })}
              </div>
            </nav>
          </>
        )}
      </div>
    </>
  );
}
