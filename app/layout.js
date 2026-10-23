import { Bricolage_Grotesque, Figtree } from 'next/font/google';
import Script from 'next/script';
import RegisterSW from './register-sw';
import './globals.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], axes: ['opsz'], variable: '--font-display' });
const body = Figtree({ subsets: ['latin'], variable: '--font-body' });

// DEMO=1 is the Vercel preview build (npm run build:demo): noindex plus the copy guard. Never set it for the live site.
const demo = process.env.DEMO === '1';

export const metadata = {
  title: { default: 'MeetDoConnect | Skip the swiping. Start doing.', template: '%s | MeetDoConnect' },
  description: 'Live alcohol-free evenings. Make something, work beside someone, or wind down, and find activity buddies.',
  manifest: '/manifest.webmanifest',
  icons: { icon: { url: '/icons/icon.svg', type: 'image/svg+xml' }, apple: '/icons/icon-192.png' },
  robots: demo ? { index: false, follow: false, noarchive: true } : undefined,
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
        {demo && <Script src="/assets/rt.js" strategy="beforeInteractive" />}
        <a className="skip" href="#main">Skip to content</a>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
