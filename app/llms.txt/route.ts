import { ACTIVITIES, PASSES_PER_MONTH } from '@/lib/sessions';
import { DEFINITION, PAGES, SITE_NAME, SITE_URL, TAGLINE } from '@/lib/site';

export const dynamic = 'force-static';

// /llms.txt: a plain-text map of the site for AI assistants (llmstxt.org), built from the same data as the pages.
export function GET() {
  const lines = [
    `# ${SITE_NAME}`,
    '',
    `> ${TAGLINE} ${DEFINITION}`,
    '',
    `Founding membership is $24 per month with 3 credits every week; one credit books any standard session. Cancel 24 hours or more before the start and the credit comes back. A Bad Hair Day pass (${PASSES_PER_MONTH} a month) lets a member cancel late and keep the credit, or join with the camera off. Times are Central. Sessions are not recorded.`,
    '',
    '## Pages',
    '',
    ...Object.entries(PAGES).map(([path, p]) => `- [${p.title ?? SITE_NAME}](${SITE_URL}${path}): ${p.description}`),
    '',
    '## Activities',
    '',
    ...ACTIVITIES.map(
      (a) =>
        `- [${a.title}](${SITE_URL}/activities/${a.slug}): ${a.blurb} ${a.mins} minutes, for ${a.who.toLowerCase()}.`,
    ),
  ];
  return new Response(`${lines.join('\n')}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
