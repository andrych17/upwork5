# MeetDoConnect

> **Skip the swiping. Start doing.**  
> Real people. Real activities. Live online. Small video rooms of about 5 to 12 people, for all ages.

**Live Website:** [https://meetdoconnect.com](https://meetdoconnect.com)

---

## Overview

MeetDoConnect is a membership for live online activities. Members get 13 sessions a month (up to 4 a week, Monday to Sunday) to book 60-minute rooms (quiet co-working, wind-downs, cooking, crafts, writing, games) with about 5 to 12 people. Afterward, two members who both pick each other can chat as activity buddies.

The design follows Kelly's Figma Make board, "Multi-Generational Video Rooms" (version 38). This repository contains the front end, built with **Next.js 16** (App Router, TypeScript, Tailwind CSS v4). It compiles into a static website (`output: 'export'`) served globally via **Cloudflare Workers Static Assets** with full offline **PWA** support.

---

## Tech Stack

| Layer                     | Technology                             | Details                                                                     |
| :------------------------ | :------------------------------------- | :-------------------------------------------------------------------------- |
| **Framework**             | Next.js 16.4 (App Router)              | Static export (`output: 'export'`), SSG                                     |
| **Language**              | TypeScript 6.0                         | Strict type safety, typed routes                                            |
| **Styling**               | Plain CSS from Figma + Tailwind CSS v4 | `app/figma.css` is the board's stylesheet; Tailwind only for the text pages |
| **Hosting & CDN**         | Cloudflare Workers Assets              | Global edge delivery, automated SSL/TLS                                     |
| **Mobile & Offline**      | Progressive Web App (PWA)              | Service Worker (`sw.js`), Web App Manifest                                  |
| **Backend**               | Supabase (Postgres + Edge Functions)   | Rules in SQL functions with RLS (`supabase/schema.sql`), Deno functions     |
| **Search & AI Discovery** | SEO, AEO, GEO                          | Schema.org JSON-LD, `sitemap.xml`, `robots.txt`, `llms.txt`                 |

---

## Project Structure

```text
site/
├── app/                              # Next.js App Router (one folder per route)
│   ├── (docs)/                       # Rules, Terms, Privacy
│   ├── calendar/ games/ signup/      # Public pages from the Figma board
│   ├── membership/ sessions/ book/[slug]/ camera-check/ live-room/ after-session/
│   │                                 # Member screens from the board, example data until Milestone 2 (noindex)
│   ├── states/ p2/                   # Board pages for screen states and member/admin tools (noindex)
│   ├── llms.txt/                     # AI assistant discovery endpoint
│   ├── offline/                      # Fallback screen when internet is lost
│   ├── figma.css                     # The Figma board's stylesheet, kept as is
│   ├── fonts.css                     # Self-hosted Bricolage Grotesque + DM Sans (same files as the board)
│   ├── globals.css                   # Imports the two files above, Tailwind tokens, text pages, footer
│   ├── layout.tsx                    # Root HTML shell, font preload & footer
│   ├── not-found.tsx                 # 404 page
│   ├── page.tsx                      # Home page + JSON-LD
│   ├── robots.ts                     # Search engine crawler permissions
│   └── sitemap.ts                    # XML sitemap of the public pages
├── components/
│   ├── screens/                      # One file per Figma Make screen (home, calendar, games, ...)
│   ├── install-button.tsx            # PWA install button (footer)
│   └── ui.tsx                        # Eyebrow and Button for the text pages
├── lib/
│   ├── placeholders.ts               # Legal template blanks (LLC name, email, dates)
│   ├── schedule/rules.ts             # Booking, credit, cancel, card and payment rules (ported from rules.js), for Milestone 2
│   ├── session-data.ts               # The 12 activities and their prep cards, from the board
│   ├── site.ts                       # Page titles, descriptions & SEO configuration
│   ├── slow-chess/engine.ts          # Chess rules and the game link format, for the Buddy Room milestone
│   └── word-rush/                    # Word Rush dictionary and scoring (the Games page checks words with it)
├── public/
│   ├── fonts/  images/  icons/       # Fonts, Figma photos (WebP), PWA icons
│   ├── manifest.webmanifest          # PWA installation manifest
│   ├── og.jpg                        # Social share card (1200x630)
│   └── sw.js                         # Offline cache service worker
├── scripts/                          # Build & checks: build-demo.ts, check.ts, guard.js, test-*.ts
├── supabase/
│   ├── schema.sql                    # Tables, RLS and every business rule as SQL functions (re-runnable)
│   ├── functions/                    # Edge Functions (Deno): hello-video, send-reminders, _shared, _tests
│   ├── cron-reminders.sql            # pg_cron job that calls send-reminders every 5 minutes
│   └── tests/                        # run.sh (schema checks in Docker Postgres), run-deno.sh (functions)
├── wrangler.json                     # Cloudflare Workers Static Assets configuration
└── next.config.ts                    # Next.js build configuration (Static HTML Export)
```

---

## Local Development

### Prerequisites

- **Node.js**: `v22.18.0` or newer
- **npm**: `v10.0.0` or newer

### Setup & Commands

```bash
# 1. Install dependencies
npm install

# 2. Run local development server (http://localhost:3000)
npm run dev

# 3. Run automated tests (Word Rush, Schedule rules and Slow Chess engine)
npm test

# 4. Check TypeScript types
npm run typecheck

# 5. Run ESLint code analysis
npm run lint

# 6. Format code with Prettier and Tailwind class sorter
npm run format

# 7. Build production static bundle (outputs to out/ and runs check.ts)
npm run build
```

---

## Deployment (Cloudflare)

The site is configured to deploy directly to **Cloudflare Workers Static Assets** or **Cloudflare Pages**.

### Deploy via Wrangler CLI

```bash
# Build static pages and deploy to Cloudflare
npm run build
npx wrangler deploy
```

`wrangler.json` automatically maps the `./out` directory to Cloudflare's edge network without requiring server-side runtime code:

```json
{
  "name": "upwork5",
  "compatibility_date": "2024-09-23",
  "assets": {
    "directory": "./out"
  }
}
```

### Domain & DNS Configuration

1. **Custom Domain**: Bound to `meetdoconnect.com` and `www.meetdoconnect.com`.
2. **Worker Route Pattern**: Ensure the route pattern is set to `meetdoconnect.com/*` (with wildcard `/*`) so sub-routes, sitemaps, and PWA manifests route properly.
3. **SSL / HTTPS**:
   - **Mode**: Full (or Flexible).
   - **Always Use HTTPS**: Enabled (redirects `http://` to `https://`).
   - **Automatic HTTPS Rewrites**: Enabled.

---

## Backend: integrations to finish

The site and the backend are separate. The site is static files on Cloudflare; everything that needs a
database or a secret runs in Supabase, so a future mobile app can call the same SQL functions and Edge
Functions. Every key below is read from the environment; nothing is in the code. A feature whose keys are
missing stays off (the site shows its preview, the function answers `503 NOT_CONFIGURED`).

| Where                     | Name                                                                                       | For                                   |
| :------------------------ | :----------------------------------------------------------------------------------------- | :------------------------------------ |
| Cloudflare build env      | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`                                | Sign-in and all member data           |
| Cloudflare build env      | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`                                                             | App notifications (public half)       |
| Supabase function secrets | `SITE_ORIGINS` (comma-separated), `SITE_URL`                                               | CORS, links in reminders              |
| Supabase function secrets | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`                   | Hello Video storage                   |
| Supabase function secrets | `CRON_SECRET`                                                                              | Only pg_cron may call send-reminders  |
| Supabase function secrets | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`                                   | App notifications                     |
| Supabase function secrets | `RESEND_API_KEY`, `RESEND_FROM`, `REPLY_TO` (optional)                                     | Email reminders                       |
| Supabase function secrets | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM` | SMS reminders (opt-in)                |
| Supabase function secrets | `DAILY_API_KEY`                                                                            | Live video rooms (room-join)          |
| Supabase Vault (SQL)      | `project_url`, `reminders_cron_secret`                                                     | Used by `supabase/cron-reminders.sql` |

Steps:

1. **Database**: run `supabase/schema.sql` in the SQL editor (safe to run again). Settings live in
   `app_config`: `require_hello_video` (no live room until an admin approved the Hello Video),
   `hello_hold_bookings` (booking before approval holds the seat), `test_payments` (Pay succeeds without a
   card until the payment processor is connected) and `sms_kinds` (`{1h}` by default, `{24h,1h}` for both).
   Kelly's rules (31 Oct): turn on `require_hello_video` and `hello_hold_bookings`.
2. **Hello Video storage**: create a private R2 bucket and an API token for that bucket only
   (Object Read & Write). Add a CORS rule allowing `PUT` and `GET` from the site origins with the
   `Content-Type` header, and a lifecycle rule deleting objects under `hello/` after 30 days as a safety net
   (files are normally deleted on review).
3. **App notifications**: `npx web-push generate-vapid-keys`. The public key goes in both places above, the
   private key only in Supabase.
4. **Functions**: `supabase secrets set NAME=value ...`, then
   `supabase functions deploy hello-video`, `supabase functions deploy room-join` and
   `supabase functions deploy send-reminders --no-verify-jwt`.
5. **Schedule**: store the two Vault secrets and run `supabase/cron-reminders.sql`.
6. **Check**: `bash supabase/tests/run.sh` (schema, Docker Postgres) and `bash supabase/tests/run-deno.sh`
   (type-check and tests for the functions, Docker Deno, no real calls).

Reminders are claimed in the database before sending, so a reminder never goes out twice; if a run
crashes halfway, the rest of that batch is skipped and logged in `reminder_log`.

### Tester sign-ups (`/testers`)

A public form for the free test week (schema section 37). Anyone can sign up without an account; the form
closes itself at the spot limit (50 by default). Admin > Testers holds the settings (form open, spots, test
week dates, the free-week code, and whether the code is sent right away) and the list, with Send code,
Decline (frees the spot) and Delete (spam). The code email goes out from `send-reminders` through Resend
within five minutes, so it needs the same `RESEND_*` secrets as the email reminders. The code is kept in
`tester_secret`, which only admins can read; it is never in `app_config`, which every visitor can read.

---

## Progressive Web App (PWA)

MeetDoConnect installs directly to a user's device without requiring an App Store or Google Play Store download.

- **Android (Chrome)**: Tap the in-app "Install the app" button or open Chrome menu (`⋮`) > **Install app** / **Add to Home screen**.
- **iOS / iPadOS (Safari)**: Tap the **Share** button (`⎋`) > select **Add to Home Screen**.
- **Desktop (Chrome / Edge)**: Click the **Install** monitor icon on the right side of the address bar.
- **Offline Support**: Pages already opened stay available offline; anything else shows `/offline`.

---

## Search, AI & Discovery (SEO / AEO / GEO)

The codebase is optimized for traditional search engines, voice assistants, and Generative AI engines:

- **SEO (Search Engine Optimization)**:
  - Unique meta titles, descriptions, canonical URLs, and an Open Graph share card (`/og.jpg`) for the public pages. Member screens are noindex.
  - Validated `/sitemap.xml` and `/robots.txt`.
- **AEO (Answer Engine Optimization)**:
  - Direct concise answers under each page headline for voice search and answer snippets.
  - Structured JSON-LD on the home page: `Organization` and `WebSite`.
- **GEO (Generative Engine Optimization)**:
  - Dedicated [`/llms.txt`](https://meetdoconnect.com/llms.txt) plain-text reference summarizing the community model, credit system, and session rules so AI models (ChatGPT, Claude, Perplexity, Gemini) can accurately recommend the platform.

---

## Pre-Launch Legal Checklist

Before opening the site to real paid members:

1. **Fill in Placeholders**:
   - Edit `lib/placeholders.ts` to provide the legal business entity name, registration state, support email, and effective date.
   - `npm run build` will flag any remaining `[BRACKET]` placeholders.
2. **Legal Review**:
   - Have a licensed attorney review the Community Rules, Terms of Service, and Privacy Policy templates.
3. **Pricing & Times**:
   - Verify prices and session times in `components/screens/` (home, calendar, membership) and `lib/session-data.ts`.

---

## Roadmap: Next Milestones (Backend & Real Application)

The current front end is built to seamlessly graduate into a full-stack SaaS application:

1. **Authentication & Member Accounts**:
   - Integration with Supabase or PostgreSQL for secure member login, passwordless magic links, and profile management.
2. **Booking & Credit Engine**:
   - Backend persistence for 13 monthly credits (16 shared for a Household of up to 4 people), the weekly limit, the 24-hour cancellation cutoff, and "Bad Hair Day" cards.
3. **Payment Processing**:
   - Square, Braintree or Helcim (not Stripe) for $26/month or $260/year (Solo) and $34/month or $349/year (Household) memberships and extra sessions ($4 each, $15 for 5).
4. **Live Video Rooms**:
   - Daily.co rooms for 60-minute sessions of up to 12 people, open only to members who booked.
5. **Real-Time Buddy Chat**:
   - WebSocket/Supabase Realtime messaging unlocked when two session attendees mutually select each other.
6. **Automated Reminders**:
   - Built, waiting for keys: app notification, email and opt-in SMS 24 hours and 1 hour before each booked
     session (`supabase/functions/send-reminders`, see "Backend: integrations to finish").

---

## License

Private and confidential. All rights reserved by **MeetDoConnect**.
