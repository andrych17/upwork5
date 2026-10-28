// Site-wide settings for links, search engines and answer engines.
// SITE_URL comes from .env.production: set it to the final domain before launch.
import type { Metadata } from 'next';

export const SITE_URL = (process.env.SITE_URL ?? 'https://meetdoconnect.com').replace(/\/$/, '');
export const SITE_NAME = 'MeetDoConnect';
export const TAGLINE = 'Skip the swiping. Start doing.';
// DEMO=1 is the Vercel preview build (npm run build:demo). Never set it for the live site.
export const isDemo = process.env.DEMO === '1';
// NOINDEX=1 is the dev.meetdoconnect.com build (wrangler.dev.json): real code, hidden from search engines.
export const noindex = isDemo || process.env.NOINDEX === '1';

// The short answer to "what is MeetDoConnect?", used in structured data and llms.txt.
export const DEFINITION =
  'MeetDoConnect is a membership for live online activities with real people. Members get three sessions a week in small video rooms of about 5 to 12 people: an hour to co-work, cook, craft, write, play or wind down together. Solo people, couples, teens and families are welcome, and two people reconnect only when both choose to be activity buddies.';

export interface PageInfo {
  /** null on the home page, which uses the site-wide default title. */
  title: string | null;
  description: string;
}

// Public pages: indexed, in the sitemap and llms.txt.
export const PAGES = {
  '/': {
    title: null,
    description:
      'Real people. Real activities. Live online. Small video rooms for all ages to co-work, cook, craft, write and play together.',
  },
  '/calendar': {
    title: 'Calendar',
    description:
      'This week’s live sessions. Pick an hour, see who it is for and what to bring, and book with one credit.',
  },
  '/games': {
    title: 'Games',
    description: 'Word Rush and Slow Chess, two friendly games to play while you wait for your session.',
  },
  '/signup': {
    title: 'Join',
    description:
      'Join MeetDoConnect in a few short steps: the basics, the community rules, a private Hello Video and your plan.',
  },
  '/rules': {
    title: 'Community Rules',
    description: 'How MeetDoConnect sessions work and what we expect from every member.',
  },
  '/terms': { title: 'Terms of Service', description: 'The terms for using MeetDoConnect.' },
  '/privacy': { title: 'Privacy Policy', description: 'What MeetDoConnect collects, why, and the choices you have.' },
} as const satisfies Record<string, PageInfo>;

export type PagePath = keyof typeof PAGES;

const OG_IMAGE = {
  url: '/og.jpg',
  width: 1200,
  height: 630,
  alt: `${SITE_NAME}: ${TAGLINE}`,
};

// Title, description, canonical link and Open Graph for one page.
export function pageMeta(path: string, info: PageInfo): Metadata {
  const { title, description } = info;
  return {
    ...(title && { title }),
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      url: path,
      title: title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} | ${TAGLINE}`,
      description,
      images: [OG_IMAGE],
    },
  };
}

export const metaFor = (path: PagePath): Metadata => pageMeta(path, PAGES[path]);

// Member screens from the Figma board. They run on example data until accounts arrive (Milestone 2),
// so search engines are kept out.
export const memberMeta = (title: string): Metadata => ({ title, robots: { index: false, follow: false } });
