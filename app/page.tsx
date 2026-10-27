import type { Metadata } from 'next';
import JsonLd from '@/components/json-ld';
import Home from '@/components/screens/home';
import { DEFINITION, SITE_NAME, SITE_URL, TAGLINE, metaFor } from '@/lib/site';

export const metadata: Metadata = metaFor('/');

export default function Page() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Organization',
              '@id': `${SITE_URL}/#org`,
              name: SITE_NAME,
              url: `${SITE_URL}/`,
              logo: `${SITE_URL}/icons/icon-512.png`,
              slogan: TAGLINE,
              description: DEFINITION,
            },
            {
              '@type': 'WebSite',
              '@id': `${SITE_URL}/#website`,
              name: SITE_NAME,
              url: `${SITE_URL}/`,
              publisher: { '@id': `${SITE_URL}/#org` },
            },
          ],
        }}
      />
      <Home />
    </>
  );
}
