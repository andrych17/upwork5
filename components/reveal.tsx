'use client';

// Scroll reveal: blocks below the fold fade up as they come into view (styles in app/motion.css).
// Only elements that start off-screen are hidden, and only once this has run, so nothing flashes and the page
// reads the same without JavaScript or with reduced motion.
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

// Every block of a section (the first section is the page hero) and every card of a list.
const TARGETS = [
  'main > section:not(:first-of-type) > *',
  '.prep-grid > *',
  '.session-list > *',
  '.membership-grid > *',
  '.credit-options > *',
  '.billing-grid > *',
  '.booked-list > *',
].join(', ');

export default function Reveal() {
  const path = usePathname();

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const all = [...document.querySelectorAll<HTMLElement>(TARGETS)];
    // ponytail: O(n²) containment check, fine for the ~100 blocks a page has. Keeps only the innermost targets
    // so a list and its cards never animate twice.
    const els = all.filter((el) => !all.some((other) => other !== el && el.contains(other)));
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute('data-shown', '');
          io.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    for (const el of els) {
      if (el.getBoundingClientRect().top < innerHeight) continue;
      // Cards in the same row arrive one after another.
      el.style.setProperty('--reveal-i', String([...el.parentElement!.children].indexOf(el) % 4));
      el.setAttribute('data-reveal', '');
      io.observe(el);
    }
    return () => io.disconnect();
  }, [path]);

  return null;
}
