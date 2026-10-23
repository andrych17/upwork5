import { Bricolage_Grotesque, Figtree } from 'next/font/google';
import Link from 'next/link';
import Script from 'next/script';
import RegisterSW from './register-sw';
import SiteNav from './site-nav';
import { PAGES, SITE_NAME, SITE_URL, TAGLINE, isDemo } from './site';
import './globals.css';
import './sections.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], axes: ['opsz'], variable: '--font-display' });
const body = Figtree({ subsets: ['latin'], variable: '--font-body' });

export const metadata = {
  description: PAGES['/'].description,
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} | ${TAGLINE}`, template: `%s | ${SITE_NAME}` },
  applicationName: SITE_NAME,
  manifest: '/manifest.webmanifest',
  icons: { icon: { url: '/icons/icon.svg', type: 'image/svg+xml' }, apple: '/icons/icon-192.png' },
  twitter: { card: 'summary_large_image' },
  robots: isDemo ? { index: false, follow: false, noarchive: true } : undefined,
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0e6a5c',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        {isDemo && <Script src="/assets/rt.js" strategy="beforeInteractive" />}
        <a className="skip" href="#main">Skip to content</a>
        <div className="wrap">
          <header className="bar">
            <Link className="logo" href="/">Meet<b>Do</b>Connect</Link>
            <SiteNav />
          </header>
          {children}
          <footer className="site-foot">
            <div>
              <div className="logo">Meet<b>Do</b>Connect</div>
              <div>{TAGLINE}</div>
            </div>
            <nav aria-label="Explore">
              <Link href="/evenings">Evenings</Link>
              <Link href="/activities">Activities</Link>
              <Link href="/how-it-works">How it works</Link>
              <Link href="/safety">Safety</Link>
              <Link href="/membership">Membership</Link>
              <Link href="/widgets-while-you-wait">Word Rush</Link>
            </nav>
            <nav aria-label="Policies">
              <Link href="/rules">Community Rules</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/privacy">Privacy</Link>
            </nav>
          </footer>
        </div>
        <RegisterSW />
      </body>
    </html>
  );
}
