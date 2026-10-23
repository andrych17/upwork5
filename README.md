# Lantern site

`public/` is the site exactly as it goes live: each page at the path from the site tree, plus the manifest, service worker, icons and the Cloudflare `_headers` file. Right now the pages are placeholders. The client's zips replace them.

## Check before every deploy

```bash
npm run check
```

It fails on local links or assets that don't exist, manifest icons that are missing or the wrong size, and `sw.js` precache paths with no file behind them. It also warns about `[BRACKET]` placeholders still in a page (the terms and privacy drafts have them).

Local preview: `npm run serve`, then open http://127.0.0.1:5195.

## Cloudflare Pages (the live site)

No build step. Either connect the repo with build command empty and output directory `public`, or upload straight from here:

```bash
npx wrangler pages deploy public --project-name <project>
```

Domain from GoDaddy:

1. In Cloudflare, add the domain (Free plan). Check the imported DNS records against GoDaddy, MX and TXT especially, so email keeps working.
2. At GoDaddy, turn DNSSEC off if it's on, then set the two nameservers Cloudflare shows.
3. Once Cloudflare says Active, open the Pages project, go to Custom domains and add both the bare domain and `www`.

The registration can stay at GoDaddy. Moving it to Cloudflare Registrar is optional: it needs the auth code, adds a year at cost, and isn't allowed within 60 days of registration or a previous transfer.

## Vercel (preview only)

`npm run build` runs the check and writes `dist/`, a copy of `public/` for the preview URL:

- `noindex` meta tag on every page, plus an `X-Robots-Tag` header from `vercel.json`
- `scripts/guard.js`, which blocks right-click, text selection, copy, print, and the view-source, save and DevTools shortcuts. It also adds a debugger trap that pauses the page while DevTools is open.
- minified HTML and CSS, obfuscated JS

This only slows down casual copying. Anyone can still open DevTools from the browser menu, turn off JavaScript, or fetch the files with `curl`. Never deploy `dist/` to the client's domain.

## When the zips arrive

1. Unzip each one into its own folder outside `public/` and look at what's inside before copying anything.
2. Copy the files to their paths in `public/`. The client's `README.md` stays at the repo root because it isn't served.
3. Put the game widget into the frame on `widgets-while-you-wait.html`, replacing the stand-in game and `assets/memory-widget.js`.
4. If the client's `sw.js` replaces this one, check its precache list. Cloudflare Pages redirects `/page.html` to `/page`, and a cached redirect can't answer a navigation. The `precache()` function here handles that.
5. `npm run check`, then test install and offline mode on a real phone.
