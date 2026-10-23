import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Figtree } from 'next/font/google';
import Link from 'next/link';
import Script from 'next/script';
import type { ReactNode } from 'react';
import RegisterSW from '@/components/register-sw';
import SiteNav from '@/components/site-nav';
import { Logo } from '@/components/ui';
import { PAGES, SITE_NAME, SITE_URL, TAGLINE, isDemo } from '@/lib/site';
import './globals.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], axes: ['opsz'], variable: '--font-bricolage' });
const body = Figtree({ subsets: ['latin'], variable: '--font-figtree' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} | ${TAGLINE}`, template: `%s | ${SITE_NAME}` },
  description: PAGES['/'].description,
  applicationName: SITE_NAME,
  manifest: '/manifest.webmanifest',
  icons: { icon: { url: '/icons/icon.svg', type: 'image/svg+xml' }, apple: '/icons/icon-192.png' },
  twitter: { card: 'summary_large_image' },
  robots: isDemo ? { index: false, follow: false, noarchive: true } : undefined,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0e6a5c',
};

const EXPLORE = [
  ['/evenings', 'Evenings'],
  ['/activities', 'Activities'],
  ['/how-it-works', 'How it works'],
  ['/safety', 'Safety'],
  ['/membership', 'Membership'],
  ['/widgets-while-you-wait', 'Word Rush'],
] as const;
const POLICIES = [
  ['/rules', 'Community Rules'],
  ['/terms', 'Terms'],
  ['/privacy', 'Privacy'],
] as const;

function FooterNav({ label, links }: { label: string; links: typeof EXPLORE | typeof POLICIES }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-x-4.5 gap-y-1.5">
      {links.map(([href, text]) => (
        <Link key={href} href={href} className="text-muted hover:text-fg">
          {text}
        </Link>
      ))}
    </nav>
  );
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        {isDemo && <Script src="/assets/rt.js" strategy="beforeInteractive" />}
        <a
          href="#main"
          className="absolute -top-16 left-4 z-50 rounded-full bg-fg px-4 py-2.5 font-semibold text-bg no-underline focus:top-3"
        >
          Skip to content
        </a>
        <div className="mx-auto max-w-site">
          <header className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 py-4.5">
            <Logo href="/" />
            <SiteNav />
          </header>
          {children}
          <footer className="mt-section flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3.5 border-t border-line pt-7 text-[0.9rem] text-muted">
            <div>
              <Logo />
              <div>{TAGLINE}</div>
            </div>
            <FooterNav label="Explore" links={EXPLORE} />
            <FooterNav label="Policies" links={POLICIES} />
          </footer>
        </div>
        <RegisterSW />
      </body>
    </html>
  );
}
