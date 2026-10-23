import type { MetadataRoute } from 'next';
import { SITE_URL, isDemo } from '@/lib/site';

export const dynamic = 'force-static';

// Everyone may crawl the live site, AI answer engines included (GPTBot, ClaudeBot, PerplexityBot, Google-Extended).
// To keep one out, add a rule like { userAgent: 'GPTBot', disallow: '/' }. The preview build blocks all crawlers.
export default function robots(): MetadataRoute.Robots {
  if (isDemo) return { rules: { userAgent: '*', disallow: '/' } };
  return { rules: { userAgent: '*', allow: '/' }, sitemap: `${SITE_URL}/sitemap.xml` };
}
