# MeetDoConnect site

Skip the swiping. Start doing.

This is a Next.js project that builds to a plain static website. `npm run build` writes HTML, CSS and JS into `out/`, and Cloudflare Pages (or any static host) serves that folder as is. No server is needed. The site installs to a phone's home screen like an app (a progressive web app). The booking buttons on the home page are a prototype: bookings, credits, reminders, buddy picks and reports are not saved, and nothing is sent or charged yet.

## What is in the project

| Path | What it is |
| --- | --- |
| `app/page.js` | Home page: prototype calendar, reminder settings, leaderless room demo, activity buddy demo, safety, membership and FAQ. The interactive parts are in `app/home-demos.js`, the example sessions in `app/sessions.js` |
| `app/widgets-while-you-wait/` | Word Rush, a free speed word game for the "while you wait" page. `engine.js` holds the rules, `words.js` the word list, `word-rush.js` the screen. Works offline once loaded, no backend needed |
| `app/(docs)/rules/` | Community Rules (plain-language draft) |
| `app/(docs)/terms/` | Terms of Service **draft template**; fill in the blanks and have a lawyer review it |
| `app/(docs)/privacy/` | Privacy Policy **draft template**; match it to the tools you really use and have a lawyer review it |
| `app/(docs)/placeholders.js` | The blanks shared by those three pages (date, email, legal name) |
| `app/offline/` | Shown when someone opens the site with no connection |
| `app/layout.js`, `app/globals.css` | Fonts, page head and the shared look: colors, buttons, cards. Each page keeps its own styles next to it (`home.css`, `docs.css`, `game.css`) |
| `public/manifest.webmanifest` | Lets phones install the site as an app |
| `public/sw.js` | Service worker that keeps the pages available offline |
| `public/icons/` | App icons (SVG, 192, 512 and maskable 512) |
| `public/prototypes/lantern-calendar-v1.html` | The earlier calendar-only prototype, kept for reference as a plain HTML file |
| `scripts/` | `check.mjs` (pre-deploy check), `test-engine.mjs` (Word Rush test), `build-demo.mjs` and `guard.js` (preview build only) |

## Work on it

Needs Node.js 20.9 or newer.

```bash
npm install
npm run dev      # http://localhost:3000, reloads as you edit
npm test         # Word Rush engine check
npm run build    # writes out/, then runs the check below
```

`npm run build` fails on local links or files that don't exist, manifest icons that are missing or the wrong size, and `sw.js` paths with no page behind them. It also lists every `[BRACKET]` still left in a page. To look at the built folder the way Cloudflare serves it, run `npx serve out`.

The service worker only runs in the built site, not in `npm run dev`.

## Put it on your domain with Cloudflare Pages

Menu names can change, so follow the labels on screen.

1. Create a free Cloudflare account.
2. In the dashboard, go to Workers & Pages and create a Pages project. Either:
   - connect the GitHub repo, with build command `npm run build` and output directory `out` (the `.node-version` file tells Cloudflare which Node to use), or
   - run `npm run build` here and upload the contents of `out/` with the direct upload option, or `npx wrangler pages deploy out --project-name <project>`.
3. Open the project, find Custom domains, and add both the bare domain and `www`.

Moving the domain from GoDaddy:

1. In Cloudflare, add the domain (Free plan). Check the imported DNS records against GoDaddy, MX and TXT especially, so email keeps working.
2. At GoDaddy, turn DNSSEC off if it's on, then set the two nameservers Cloudflare shows.
3. Once Cloudflare says Active, add the custom domains from step 3 above. Confirm the site loads over https.

The registration can stay at GoDaddy. Moving it to Cloudflare Registrar is optional: it needs the auth code, adds a year at cost, and isn't allowed within 60 days of registration or a previous transfer.

Check the install behavior: in Chrome, open the site, then DevTools, then the Application tab, and look at Manifest and Service Workers. On Android, Chrome may offer to install it. On iPhone, open the site in Safari, tap Share, then Add to Home Screen.

If you change the page list in `public/sw.js`, change `CACHE` there too (for example to `meetdoconnect-v3`) so phones pick up the new copy.

## Before you take payments or members

- Fill in the blanks in the Rules, Terms and Privacy pages: dates, legal name, email, prices, state. The shared ones are in `app/(docs)/placeholders.js`; the rest are the `ph('...', '...')` calls in `app/(docs)/terms/page.js` and `app/(docs)/privacy/page.js`. Replace each call with your final text. (The second value in each call is only the sample text shown on the preview site.) `npm run build` lists any `[BRACKET]` still left.
- Have a lawyer review the Terms and Privacy pages. They are starting outlines, not legal advice.
- Remove the draft notices and the comments at the top of those two pages when they are final.
- On the home page, the prices and times are examples. Prices are in `app/page.js` (`$24`, `$4`, `$8`, `$15`) and the session times and seats in `app/sessions.js`.

## What to build next so it works for real

The page is the front end. To make it live you need:

1. **Accounts, credits, bookings, buddy picks and reports:** a hosted database with sign-in, such as Supabase. Its free tier pauses a project after a week of inactivity, so move to a paid plan at launch.
2. **Payments:** Stripe checkout for the membership and extra credits.
3. **Video:** an embeddable service such as JaaS (Jitsi as a Service), authorized by a small server step so only booked members enter a room.
4. **Reminders:** an email service triggered from the database (confirmation, 48 hours, 24 hours, 1 hour, Sunday credits, after-session buddy picks). Texts need each member's opt-in and carrier registration.
5. **Push notifications on phones:** web push through the installed app, which on iPhone needs iOS 16.4 or later.

Nothing here has been tested against live Stripe, Supabase or JaaS accounts. Steps 1 to 4 need a server, so at that point the site moves from a static export to a Next.js app with server routes (Cloudflare Workers or Vercel).

## Word Rush notes

- Everyone who enters the same deal code gets the same tiles in the same order, so friends on different devices can compare scores without a server. Live head-to-head rooms would need the database from step 1 above.
- The word list is built from the open Hunspell en_US (SCOWL) dictionary: about 37,000 words of 2 to 7 letters. It is smaller than a full tournament list, so a few valid words will be rejected. Keep the SCOWL/Hunspell credit in the footer and check its license text before a commercial launch.
- Strong profanity was left out of the list. Add more words to the `BLOCKED` list in `engine.js` as needed.
- Tile values, tile counts and scoring are original to this game, not copied from any commercial word game.

## Preview site (Vercel)

`npm run build:demo` builds the preview into `dist/`. It is the same site with three differences: a `noindex` tag on every page (plus the `X-Robots-Tag` header from `vercel.json`), sample text in place of every `[BRACKET]`, and `scripts/guard.js`, which blocks right-click, text selection, copy, print, and the view-source, save and DevTools shortcuts, with a debugger trap that pauses the page while DevTools is open.

The guard only slows down casual copying. Anyone can still open DevTools from the browser menu, turn off JavaScript, or fetch the files with `curl`. Never deploy `dist/` to the live domain.
