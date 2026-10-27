import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import Script from 'next/script';
import type { ReactNode } from 'react';
import RegisterSW from '@/components/register-sw';
import Reveal from '@/components/reveal';
import InstallButton from '@/components/install-button';
import { PAGES, SITE_NAME, SITE_URL, TAGLINE, isDemo } from '@/lib/site';
import './globals.css';

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
  themeColor: '#183b67',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // data-scroll-behavior: the board scrolls smoothly; this lets Next.js open each new page at the top instead
    // of gliding up from where you were. In-page links (Find something to do) stay smooth.
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        <link rel="preload" href="/fonts/bricolage-grotesque-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/dm-sans-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        {isDemo && <Script src="/assets/rt.js" strategy="beforeInteractive" />}
        {children}
        <footer className="site-footer">
          <Link className="schedule-mark" href="/" aria-label={`${SITE_NAME} home`}>
            <span>Meet</span>
            <span>Do</span>
            <span>Connect</span>
          </Link>
          <nav aria-label="Policies">
            <Link href="/rules">Community Rules</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </nav>
          <InstallButton />
        </footer>
        <RegisterSW />
        <Reveal />
      </body>
    </html>
  );
}
