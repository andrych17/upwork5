'use client';

// Mobile menu. Below 960px the Figma board hides the header links, so phones had no way to reach Calendar,
// Games or Membership. This button opens those same links as a drop-down (styles in app/motion.css) and is
// hidden on wider screens. It marks its <header> with data-open; any click, a link tap or Escape closes it.
import { useEffect, useRef, useState } from 'react';

export default function MenuToggle() {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    ref.current?.closest('header')?.toggleAttribute('data-open', open);
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [open]);

  return (
    <button
      ref={ref}
      type="button"
      className="menu-toggle"
      aria-label={open ? 'Close menu' : 'Menu'}
      aria-expanded={open}
      onClick={() => setOpen(!open)}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path
          d={open ? 'M4 4l10 10M14 4L4 14' : 'M2 4.5h14M2 9h14M2 13.5h14'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
