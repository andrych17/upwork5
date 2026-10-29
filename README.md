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
   - Square, Braintree or Helcim (not Stripe) for $26/month or $260/year (Individual) and $34/month or $340/year (Household) memberships and extra sessions ($4 each, $15 for 5).
4. **Live Video Rooms**:
   - Daily.co rooms for 60-minute sessions of up to 12 people, open only to members who booked.
5. **Real-Time Buddy Chat**:
   - WebSocket/Supabase Realtime messaging unlocked when two session attendees mutually select each other.
6. **Automated Reminders**:
   - Email/SMS reminders (48-hour supply card notice, 24-hour lock-in, 1-hour room link).

---

## License

Private and confidential. All rights reserved by **MeetDoConnect**.
