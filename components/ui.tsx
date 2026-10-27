// Small building blocks shared by every page. Colors come from the tokens in app/globals.css.
import type { ComponentProps, ReactNode } from 'react';
import { extendTailwindMerge } from 'tailwind-merge';

// Joins class names; when two classes set the same thing (text-muted and text-fg), the later one wins.
// The custom theme sizes are listed so tailwind-merge knows text-lead is a font size, not a color.
const merge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['hero', 'title', 'section', 'lead'],
      radius: ['shell', 'core', 'card'],
      shadow: ['lift'],
      ease: ['spring'],
    },
  },
});
export const cn = (...classes: (string | false | null | undefined)[]) => merge(classes);

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-2 self-start justify-self-start rounded-full bg-sun-soft px-3 py-1.5 text-[0.7rem] leading-tight font-bold tracking-[0.16em] text-sun-ink uppercase',
        className,
      )}
    >
      {children}
    </span>
  );
}

const BUTTON = {
  base: 'group inline-flex items-center justify-center gap-2.5 rounded-full font-semibold leading-tight no-underline transition duration-200 ease-spring active:scale-97 disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100',
  primary: 'bg-accent text-accent-fg shadow-[0_10px_24px_-14px_var(--accent)] hover:ring-4 hover:ring-accent/20',
  secondary:
    'bg-surface text-fg ring-1 ring-line hover:ring-[1.5px] hover:ring-accent disabled:hover:ring-1 disabled:hover:ring-line',
  quiet: 'text-muted hover:bg-line hover:text-fg',
  md: 'min-h-11 px-5 py-2.5 whitespace-nowrap',
  lg: 'min-h-[54px] px-6.5 py-2 text-center text-[1.05rem]',
} as const;

type ButtonStyle = {
  variant?: 'primary' | 'secondary' | 'quiet';
  size?: 'md' | 'lg';
  /** Arrow in its own circle at the end of the button. */
  arrow?: '→' | '↓';
};

function buttonClass({ variant = 'secondary', size = 'md', arrow }: ButtonStyle, className?: string) {
  return cn(BUTTON.base, BUTTON[variant], BUTTON[size], variant === 'quiet' && 'px-3', arrow && 'pr-2', className);
}

function ButtonArrow({ arrow }: { arrow?: string }) {
  if (!arrow) return null;
  return (
    <span
      aria-hidden="true"
      className="grid size-9.5 shrink-0 place-items-center rounded-full bg-current/15 transition-transform duration-300 ease-spring group-hover:translate-x-0.5"
    >
      {arrow}
    </span>
  );
}

export function Button({
  variant,
  size,
  arrow,
  className,
  children,
  ...props
}: ButtonStyle & ComponentProps<'button'>) {
  return (
    <button type="button" className={buttonClass({ variant, size, arrow }, className)} {...props}>
      {children}
      <ButtonArrow arrow={arrow} />
    </button>
  );
}

// A sun light with a slow ring, for "live" things.
