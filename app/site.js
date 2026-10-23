// Site-wide settings for links, search engines and answer engines.
// SITE_URL comes from .env.production: set it to the final domain before launch.
export const SITE_URL = (process.env.SITE_URL || 'https://meetdoconnect.com').replace(/\/$/, '');
export const SITE_NAME = 'MeetDoConnect';
export const TAGLINE = 'Skip the swiping. Start doing.';
// DEMO=1 is the Vercel preview build (npm run build:demo). Never set it for the live site.
export const isDemo = process.env.DEMO === '1';

// The short answer to "what is MeetDoConnect?", used on the home page, in structured data and llms.txt.
export const DEFINITION = 'MeetDoConnect is a membership for live, alcohol-free evenings online. You get 3 credits a week to book sessions where you make something, work beside someone, or wind down. Social sessions split into rooms of about 5, cameras are optional, and afterward you can find activity buddies. It is friendship first, and it is not a sobriety program.';

// Every indexable page except the activity pages (those come from sessions.js).
export const PAGES = {
  '/': { title: null, description: 'Live alcohol-free evenings. Make something, work beside someone, or wind down, and find activity buddies.' },
  '/evenings': { title: 'This week’s evenings', description: 'The example calendar of live alcohol-free sessions: book with weekly credits, open prep cards and see your reminders.' },
  '/activities': { title: 'Activities', description: 'Every MeetDoConnect session, from Mocktail Studio and Quiet Co-Work to Trivia Showdown, with supplies, cost and the run of show.' },
  '/how-it-works': { title: 'How it works', description: 'Rooms of about 5 run themselves with a shared timer, prompts and rotating roles. Afterward, mutual picks become activity buddies.' },
  '/safety': { title: 'Safety', description: 'Paid and verified members, probation, a code of conduct, rooms that lock, a two-report rule and a weekly review.' },
  '/membership': { title: 'Membership', description: 'Founding member: $24 a month for 3 credits every week. Extra credits, household add-on and answers to common questions.' },
  '/widgets-while-you-wait': { title: 'Widgets While You Wait', description: 'Word Rush, a free speed word game to play while you wait for your MeetDoConnect session.' },
  '/rules': { title: 'Community Rules', description: 'How MeetDoConnect sessions work and what we expect from every member.' },
  '/terms': { title: 'Terms of Service', description: 'The terms for using MeetDoConnect.' },
  '/privacy': { title: 'Privacy Policy', description: 'What MeetDoConnect collects, why, and the choices you have.' },
};

export function pageMeta(path, { title = PAGES[path].title, description = PAGES[path].description } = {}) {
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
      images: [{ url: '/og.png', width: 1200, height: 630, alt: `${SITE_NAME}: ${TAGLINE} Live alcohol-free evenings in rooms of about 5.` }],
    },
  };
}
