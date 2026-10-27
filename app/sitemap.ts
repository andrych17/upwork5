import type { MetadataRoute } from 'next';
import { PAGES, SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  return Object.keys(PAGES).map((path) => ({ url: `${SITE_URL}${path}` }));
}
