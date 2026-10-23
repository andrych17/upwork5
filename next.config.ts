import type { NextConfig } from 'next';

// Static export: `next build` writes plain HTML, CSS and JS to out/, which Cloudflare serves as is (wrangler.json).
// When the site needs a server (accounts, bookings, payments), remove `output` and deploy with @opennextjs/cloudflare.
const config: NextConfig = {
  output: 'export',
  typedRoutes: true,
};

export default config;
