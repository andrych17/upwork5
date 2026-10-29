import { prepCards } from '@/lib/session-data';
import { DEFINITION, PAGES, SITE_NAME, SITE_URL, TAGLINE } from '@/lib/site';

export const dynamic = 'force-static';

// /llms.txt: a plain-text map of the site for AI assistants (llmstxt.org), built from the same data as the pages.
export function GET() {
  const lines = [
    `# ${SITE_NAME}`,
    '',
    `> ${TAGLINE} ${DEFINITION}`,
    '',
    'Membership is $26 a month or $260 a year for individuals, with 13 sessions every month (up to four a week). A Household is $34 a month or $340 a year for up to four people, each with their own sign-in, sharing 16 sessions a month. Annual members get their sessions each month too. Extra sessions are $4 each or $15 for five, never expire, and can be used past the weekly limit. Unused monthly sessions do not carry over. Every session is 60 minutes and uses one credit per person. Weeks run Monday to Sunday. Times are Central.',
    '',
    '## Pages',
    '',
    ...Object.entries(PAGES).map(([path, p]) => `- [${p.title ?? SITE_NAME}](${SITE_URL}${path}): ${p.description}`),
    '',
    '## Activities',
    '',
    ...prepCards.map((a) => `- ${a.title}: for ${a.forWhom.toLowerCase()}. Bring: ${a.prep}`),
  ];
  return new Response(`${lines.join('\n')}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
