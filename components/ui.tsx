// Small building blocks shared by every page. Colors come from the tokens in app/globals.css.
import type { Route } from 'next';
import Link from 'next/link';
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

export function Logo({ href }: { href?: Route }) {
  const word = (
    <>
      Meet<b className="text-accent">Do</b>Connect
    </>
  );
  const style = 'font-display text-[1.45rem] font-bold tracking-[-0.035em] text-fg no-underline';
  return href ? (
    <Link href={href} className={style}>
      {word}
    </Link>
  ) : (
    <div className={style}>{word}</div>
  );
}

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

export function ButtonLink({
  variant,
  size,
  arrow,
  className,
  children,
  href,
}: ButtonStyle & { href: Route; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={buttonClass({ variant, size, arrow }, className)}>
      {children}
      <ButtonArrow arrow={arrow} />
    </Link>
  );
}

// Double bezel: a thin outer shell with a hairline ring holding an inner core with concentric corners.
export function Shell({
  ink,
  as: Tag = 'div',
  className,
  coreClassName,
  children,
  ...aria
}: {
  ink?: boolean;
  as?: 'div' | 'aside' | 'section';
  className?: string;
  coreClassName?: string;
  children: ReactNode;
  'aria-label'?: string;
}) {
  return (
    <Tag className={cn('min-w-0 rounded-shell bg-shell p-1.5 shadow-lift ring-1 ring-line', className)} {...aria}>
      <div
        className={cn(
          'grid min-w-0 content-start gap-3.5 rounded-core p-[clamp(18px,3vw,28px)] shadow-[inset_0_1px_0_var(--highlight)]',
          ink ? 'ink' : 'bg-surface ring-1 ring-line',
          coreClassName,
        )}
      >
        {children}
      </div>
    </Tag>
  );
}

export function Section({ className, children, ...props }: ComponentProps<'section'>) {
  return (
    <section className={cn('grid gap-[clamp(20px,3vw,32px)] pt-section', className)} {...props}>
      {children}
    </section>
  );
}

export function SectionHead({
  eyebrow,
  title,
  id,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  id?: string;
  children?: ReactNode;
}) {
  return (
    <div className="grid max-w-[46rem] gap-3.5">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 id={id} className="text-section">
        {title}
      </h2>
      {children}
    </div>
  );
}

export function PageHead({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="grid max-w-[52rem] gap-4 pt-[clamp(32px,7vw,88px)]">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="text-title">{title}</h1>
      {children}
    </header>
  );
}

export function Lead({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('max-w-prose text-lead text-muted', className)}>{children}</p>;
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-prose justify-self-start rounded-xl bg-warn-bg px-3.5 py-2.5 text-[0.9rem] text-warn">
      {children}
    </p>
  );
}

export function CheckList({ items, className }: { items: readonly string[]; className?: string }) {
  return (
    <ul className={cn('grid gap-1.5', className)}>
      {items.map((item) => (
        <li
          key={item}
          className="relative pl-7 before:absolute before:top-[5px] before:left-1.5 before:h-[11px] before:w-1.5 before:rotate-45 before:border-r-2 before:border-b-2 before:border-accent before:content-['']"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

// A sun light with a slow ring, for "live" things.
export function LiveDot() {
  return (
    <span aria-hidden="true" className="relative flex size-2.5 shrink-0">
      <span className="absolute inline-flex size-full rounded-full bg-sun opacity-60 motion-safe:animate-ping" />
      <span className="relative inline-flex size-2.5 rounded-full bg-sun" />
    </span>
  );
}
