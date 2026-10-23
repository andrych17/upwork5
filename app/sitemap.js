import { ACTIVITIES } from './sessions';
import { PAGES, SITE_URL } from './site';

export const dynamic = 'force-static';

export default function sitemap() {
  return [...Object.keys(PAGES), ...ACTIVITIES.map((a) => `/activities/${a.slug}`)].map((path) => ({ url: `${SITE_URL}${path}` }));
}
