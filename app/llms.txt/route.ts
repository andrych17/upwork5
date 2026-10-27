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
    'Membership is $24 a month or $240 a year, with three sessions every week. Extra sessions are $4 each and never expire. Every session is 60 minutes and uses one credit. Times are Central.',
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
