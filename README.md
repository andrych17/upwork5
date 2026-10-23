# MeetDoConnect site

Skip the swiping. Start doing.

A Next.js 16 project (App Router, TypeScript, Tailwind CSS v4) that builds to a plain static website. `npm run build` writes HTML, CSS and JS into `out/`, and Cloudflare serves that folder as is. No server is needed yet. The site installs to a phone's home screen like an app (a progressive web app).

The interactive parts are prototypes: bookings, credits, the Bad Hair Day pass, reminders, buddy picks and reports are not saved, and nothing is sent or charged yet.

## What is in the project

- `app/`: the routes. Each folder is a page: `/` (home), `evenings` (the prototype calendar), `activities` and `activities/[slug]` (one page per activity), `how-it-works`, `safety`, `membership`, `widgets-while-you-wait` (Word Rush), `offline`, and `(docs)` for Rules, Terms and Privacy. `sitemap.ts`, `robots.ts` and `llms.txt/route.ts` are generated from the same data. `globals.css` holds the Tailwind setup and the brand tokens.
- `components/`: shared UI. `ui.tsx` has the small building blocks (`Button`, `Shell`, `Eyebrow`, `Section`, `PageHead` and so on), `demos.tsx` the interactive prototypes (calendar, room, buddy picks, report, join), `word-rush.tsx` the game screen, `install-button.tsx` the "Install the app" button.
- `lib/`: data and logic with no UI. `sessions.ts` is the example calendar and the prototype rules (credits, the 24-hour window, passes per month). `site.ts` holds the domain, page titles and descriptions. `placeholders.ts` holds the blanks in the legal pages. `word-rush/engine.ts` is the game logic.
- `public/`: `manifest.webmanifest`, `sw.js` (offline support), `icons/`, `og.png` (the share image) and `prototypes/lantern-calendar-v1.html` (the earlier calendar, kept for reference and not indexed).
- `scripts/`: `check.ts` (pre-deploy check), `test-engine.ts` (Word Rush test), `build-demo.ts` and `guard.js` (preview build only).

## Work on it

Needs Node.js 22.18 or newer (the scripts are TypeScript that Node runs directly).

```bash
npm install
npm run dev        # http://localhost:3000, reloads as you edit
npm run lint       # ESLint with the Next.js rules
npm run typecheck  # TypeScript, including typed routes
npm run format     # Prettier, also sorts Tailwind classes
npm test           # Word Rush engine check
npm run build      # writes out/, then runs the check below
```

`npm run build` fails on local links or files that don't exist, manifest icons that are missing or the wrong size, `sw.js` paths and sitemap URLs with no page behind them, and structured data that isn't valid JSON. It also lists every `[BRACKET]` still left in a page. To look at the built folder the way Cloudflare serves it, run `npx serve out`. The service worker only runs in the built site, not in `npm run dev`.

Styling conventions: Tailwind utilities in the markup, brand colors and sizes as tokens in `app/globals.css` (`bg-surface`, `text-muted`, `text-title`, `rounded-card` …). Repeated patterns are components in `components/ui.tsx`, not `@apply` classes. Dark mode follows the visitor's system setting; the dark "ink" panels use the `ink` utility, which re-points the colors inside them.

## Deploy to Cloudflare

`wrangler.json` serves `out/` as Workers static assets and shows the 404 page for unknown paths:

```bash
npm run build
npx wrangler deploy
```

Moving the domain from GoDaddy:

1. In Cloudflare, add the domain (Free plan). Check the imported DNS records against GoDaddy, MX and TXT especially, so email keeps working.
2. At GoDaddy, turn DNSSEC off if it's on, then set the two nameservers Cloudflare shows.
3. Once Cloudflare says Active, add the bare domain and `www` as custom domains on the Worker. Confirm the site loads over https.

The registration can stay at GoDaddy. Moving it to Cloudflare Registrar is optional: it needs the auth code, adds a year at cost, and isn't allowed within 60 days of registration or a previous transfer.

Installing on a phone: on Android and desktop Chrome or Edge, the "Install the app" button on the home page opens the browser's install dialog. On iPhone and iPad, the button explains Safari's Share, then Add to Home Screen. In Chrome DevTools, the Application tab shows the manifest and the service worker. If you change the page list in `public/sw.js`, change `CACHE` there too (for example to `meetdoconnect-v3`) so phones pick up the new copy.

## Search and answer engines

- Every page has its own title, description, canonical link and share image (`public/og.png`). `SITE_URL` in `.env.production` sets the domain used in those links.
- `/sitemap.xml` lists every page, including the 13 activity pages. `/robots.txt` lets every crawler in, AI assistants included; `app/robots.ts` shows how to keep one out.
- Structured data (JSON-LD): Organization and WebSite on the home page, FAQPage and the membership offer on `/membership`, ItemList on `/activities`, BreadcrumbList and HowTo on each activity page, WebApplication for Word Rush.
- `/llms.txt` is a plain-text summary of the site and its activities for AI assistants.
- Each page opens with a short, direct answer under its title. Keep that pattern when adding pages.
- Not marked up yet: sessions as `Event`s. Add that once sessions have real dates.

## Before you take payments or members

- Fill in the blanks in the Rules, Terms and Privacy pages: dates, legal name, email, prices, state. The shared ones are in `lib/placeholders.ts`; the rest are the `ph('...', '...')` calls in `app/(docs)/terms/page.tsx` and `app/(docs)/privacy/page.tsx`. Replace each call with your final text. (The second value in each call is only the sample text shown on the preview site.) `npm run build` lists any `[BRACKET]` still left.
- Have a lawyer review the Terms and Privacy pages. They are starting outlines, not legal advice.
- Remove the draft notices and the comments at the top of those two pages when they are final.
- Prices and times are examples. Prices are in `app/page.tsx` and `app/membership/page.tsx` (`$24`, `$4`, `$8`, `$15`); session times and seats in `lib/sessions.ts`; the cancellation window and passes per month at the top of the prototype rules in `lib/sessions.ts`.

## What to build next so it works for real

The pages are the front end. To make it live you need:

1. **Accounts, credits, bookings, the Bad Hair Day pass, buddy picks and reports:** a hosted database with sign-in, such as Supabase. Its free tier pauses a project after a week of inactivity, so move to a paid plan at launch.
2. **Payments:** Stripe checkout for the membership and extra credits.
3. **Video:** an embeddable service such as JaaS (Jitsi as a Service), authorized by a small server step so only booked members enter a room.
4. **Reminders:** an email service triggered from the database (confirmation, 48 hours, 24 hours, 1 hour, Sunday credits, after-session buddy picks). Texts need each member's opt-in and carrier registration.
5. **Push notifications on phones:** web push through the installed app, which on iPhone needs iOS 16.4 or later.

Steps 1 to 4 need a server. At that point remove `output: 'export'` from `next.config.ts` and deploy with the OpenNext Cloudflare adapter (`@opennextjs/cloudflare`); the pages, components and `lib/` stay as they are, and the example data in `lib/sessions.ts` is replaced by database queries. Nothing here has been tested against live Stripe, Supabase or JaaS accounts.

## Word Rush notes

- Everyone who enters the same deal code gets the same tiles in the same order, so friends on different devices can compare scores without a server. Live head-to-head rooms would need the database from step 1 above.
- The word list is built from the open Hunspell en_US (SCOWL) dictionary: about 37,000 words of 2 to 7 letters. It is smaller than a full tournament list, so a few valid words will be rejected. Keep the SCOWL/Hunspell credit on the page and check its license text before a commercial launch.
- Strong profanity was left out of the list. Add more words to the `BLOCKED` list in `lib/word-rush/engine.ts` as needed.
- Tile values, tile counts and scoring are original to this game, not copied from any commercial word game.

## Preview site (Vercel)

`npm run build:demo` builds the preview into `dist/`. It is the same site with three differences: a `noindex` tag on every page (plus the `X-Robots-Tag` header from `vercel.json` and a robots.txt that blocks all crawlers), sample text in place of every `[BRACKET]`, and `scripts/guard.js`, which blocks right-click, text selection, copy, print, and the view-source, save and DevTools shortcuts, with a debugger trap that pauses the page while DevTools is open.

The guard only slows down casual copying. Anyone can still open DevTools from the browser menu, turn off JavaScript, or fetch the files with `curl`. Never deploy `dist/` to the live domain.
