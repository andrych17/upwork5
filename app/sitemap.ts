import type { MetadataRoute } from 'next';
import { ACTIVITIES } from '@/lib/sessions';
import { PAGES, SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [...Object.keys(PAGES), ...ACTIVITIES.map((a) => `/activities/${a.slug}`)];
  return paths.map((path) => ({ url: `${SITE_URL}${path}` }));
}
